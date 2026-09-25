/**
 * Small dependency-free Markdown -> HTML renderer.
 * Supports: fenced code (with copy button + light token highlighting), headings,
 * bold/italic/inline code, links, ordered/unordered lists, tables, blockquotes, hr.
 * All input is HTML-escaped before any markup is produced.
 */

const ESC: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(s: string): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
}

const PH_LINE = /^\u0000[\uE000-\uF8FF]$/;
const PH_ANY = /\u0000([\uE000-\uF8FF])/g;
const KEYWORDS =
  "const|let|var|function|return|if|else|elif|for|while|class|new|import|from|export|default|async|await|try|catch|finally|throw|typeof|instanceof|extends|implements|super|this|null|undefined|true|false|interface|type|enum|public|private|protected|readonly|def|None|True|False|lambda|yield|in|of|as|not|and|or|switch|case|break|continue|do|void|static|int|float|string|bool|struct|impl|fn|mut|use|pub|char|double|long|package";

function highlight(code: string): string {
  const store: string[] = [];
  const put = (html: string) => {
    store.push(html);
    return "\u0000" + String.fromCharCode(0xf000 + store.length - 1);
  };
  let out = escapeHtml(code);
  // strings first so comments/keywords inside them are untouched
  out = out.replace(/(&quot;[^\n]*?&quot;|&#39;[^\n]*?&#39;|`[^`\n]*?`)/g, (m) => put(`<span class="tok-s">${m}</span>`));
  out = out.replace(/(\/\*[\s\S]*?\*\/)|(\/\/[^\n]*)|((?:^|\n)[ \t]*#[^\n]*)/g, (m) => put(`<span class="tok-c">${m}</span>`));
  out = out.replace(new RegExp(`\\b(${KEYWORDS})\\b`, "g"), '<span class="tok-k">$1</span>');
  out = out.replace(/\b\d+(?:\.\d+)?\b/g, '<span class="tok-n">$&</span>');
  return out.replace(PH_ANY, (_m, c: string) => store[c.charCodeAt(0) - 0xf000] ?? "");
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

function isTableSep(line: string): boolean {
  return line.includes("-") && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);
}

function inline(text: string): string {
  const store: string[] = [];
  let s = escapeHtml(text);
  s = s.replace(/`([^`\n]+)`/g, (_m, code: string) => {
    store.push(`<code class="inline">${code}</code>`);
    return "\u0000" + String.fromCharCode(0xf000 + store.length - 1);
  });
  s = s.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*\w])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  s = s.replace(
    /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  );
  return s.replace(PH_ANY, (_m, c: string) => store[c.charCodeAt(0) - 0xf000] ?? "");
}

export function renderMarkdown(src: string, highlightCode = true): string {
  const blocks: string[] = [];
  const stash = (html: string) => {
    blocks.push(html);
    return "\u0000" + String.fromCharCode(0xe000 + blocks.length - 1);
  };

  let text = String(src ?? "").replace(/\r\n?/g, "\n");

  // fenced code blocks
  text = text.replace(/```([^\n`]*)\n([\s\S]*?)```/g, (_m, lang: string, code: string) => {
    const raw = String(code).replace(/\n$/, "");
    const label = String(lang || "").trim().toLowerCase() || "text";
    const body = highlightCode ? highlight(raw) : escapeHtml(raw);
    return (
      "\n\n" +
      stash(
        `<div class="codeblock"><div class="cb-head"><span class="lang">${escapeHtml(label)}</span>` +
          `<button type="button" class="copy" data-code="${encodeURIComponent(raw)}">Copy</button></div>` +
          `<pre><code>${body}</code></pre></div>`
      ) +
      "\n\n"
    );
  });

  const lines = text.split("\n");
  const isBlockStart = (s: string): boolean =>
    /^\s*$/.test(s) ||
    PH_LINE.test(s.trim()) ||
    /^#{1,6}\s+/.test(s.trim()) ||
    /^\s*>\s?/.test(s) ||
    /^\s*[-*+]\s+/.test(s) ||
    /^\s*\d+[.)]\s+/.test(s) ||
    /^\s*([-*_])\1{2,}\s*$/.test(s.trim());

  let out = "";
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*$/.test(line)) {
      i++;
      continue;
    }
    const lt = line.trim();

    if (PH_LINE.test(lt)) {
      out += lt;
      i++;
      continue;
    }

    const head = lt.match(/^(#{1,6})\s+(.*)$/);
    if (head) {
      const lv = Math.min(head[1].length, 3);
      out += `<h${lv}>${inline(head[2])}</h${lv}>`;
      i++;
      continue;
    }

    if (/^([-*_])\1{2,}$/.test(lt)) {
      out += "<hr>";
      i++;
      continue;
    }

    if (/^>\s?/.test(lt)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      out += `<blockquote>${buf.map(inline).join("<br>")}</blockquote>`;
      continue;
    }

    if (lt.includes("|") && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const cells = splitRow(lt);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim() !== "" && lines[i].includes("|")) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      out +=
        `<table><thead><tr>${cells.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead>` +
        `<tbody>${rows
          .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`)
          .join("")}</tbody></table>`;
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ""));
        i++;
      }
      out += `<ul>${items.map((t) => `<li>${inline(t)}</li>`).join("")}</ul>`;
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ""));
        i++;
      }
      out += `<ol>${items.map((t) => `<li>${inline(t)}</li>`).join("")}</ol>`;
      continue;
    }

    const para: string[] = [];
    while (i < lines.length && !isBlockStart(lines[i])) {
      para.push(lines[i]);
      i++;
    }
    if (para.length) out += `<p>${para.map(inline).join("<br>")}</p>`;
    else i++;
  }

  return out.replace(PH_ANY, (_m, c: string) => blocks[c.charCodeAt(0) - 0xe000] ?? "");
}
