"use strict";

/**
 * Sandboxed data-analysis worker.
 *
 * Runs model-written JavaScript against an attached dataset. It is deliberately
 * isolated in a Web Worker: no DOM, no fetch, no importScripts, no access to
 * the page or the server. The worker is terminated after a short timeout so a
 * runaway loop can't hang the app.
 *
 * The model receives the data as a `data` array of row objects and must print
 * its findings with `out(...)` (or `console.log`) and finish by assigning a
 * value to `result`.
 */

const rows = self.data || [];
const logs = [];
const MAX_LOG_CHARS = 20000;

function fmt(v) {
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

const out = (...args) => {
  const line = args.map(fmt).join(" ");
  if (logs.join("\n").length < MAX_LOG_CHARS) logs.push(line);
};

const sandboxConsole = {
  log: out,
  info: out,
  warn: out,
  error: out,
  table: (v) => out(v),
};

let sandboxResult;
let sandboxError;

try {
  // eslint-disable-next-line no-new-func
  const fn = new Function(
    "data",
    "out",
    "console",
    `"use strict";\n${self.code}\n;return typeof result === "undefined" ? undefined : result;`
  );
  sandboxResult = fn(rows, out, sandboxConsole);
} catch (err) {
  sandboxError = err && err.message ? err.message : String(err);
}

self.postMessage({
  ok: !sandboxError,
  error: sandboxError || null,
  result: sandboxResult === undefined ? null : fmt(sandboxResult),
  logs: logs.join("\n"),
  rowCount: rows.length,
});
