import type { Metadata } from "next";
import LegalPage, { Section } from "@/components/LegalPage";
import { POLICY_REVISED, SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: `Help — ${SITE_NAME}`,
  description: `How to use ${SITE_NAME}: API keys, models, files and images, the built-in tools, keyboard shortcuts, and fixes for the problems people hit most.`,
  alternates: { canonical: "/help" },
  openGraph: {
    title: `Help — ${SITE_NAME}`,
    description: "API keys, models, files, tools, shortcuts and fixes.",
    url: "/help",
  },
};

export default function HelpPage() {
  return (
    <LegalPage
      title="Help"
      intro={`Answers about how ${SITE_NAME} works. Where this site describes something and the software does something else, that is a bug worth reporting.`}
      updated={POLICY_REVISED}
    >
      <Section title="Getting started">
        <p>
          Open the app, pick a model from the picker at the top, and send a message. If a model answers, everything is
          working. If it does not, the most common cause is the one below.
        </p>
        <p>
          <strong>Your conversations live in this browser.</strong> There is no server copy. Clearing site data, or
          using private browsing, deletes them permanently. Export anything you want to keep first.
        </p>
      </Section>

      <Section title="API keys and providers">
        <p>
          {SITE_NAME} does not include a model. It talks to a provider you point it at, and there are two ways to
          authenticate:
        </p>
        <ul>
          <li>
            <strong>Use the built-in key.</strong> Leave the key field empty. Requests are made with a key held in
            the server environment. Nothing to configure.
          </li>
          <li>
            <strong>Bring your own.</strong> Enter a key in Settings, and optionally a different base URL. The key is
            stored in your browser and sent with each request.
          </li>
        </ul>
        <p>
          Entering a key switches the app to using it, so if you are on the built-in key and it stops working,
          checking whether a key you entered earlier is still valid is a fast first move.
        </p>
        <p>
          <strong>&quot;No API key configured&quot;</strong> means the server has no key and none is stored in your
          browser. This is the single most common first-run problem.
        </p>
      </Section>

      <Section title="Keyboard shortcuts">
        <ShortcutTable
          rows={[
            ["New chat", "Ctrl/Cmd + Shift + O"],
            ["Settings", "Ctrl/Cmd + Shift + S"],
            ["Keyboard help", "?"],
            ["Close menus and dialogs", "Escape"],
            ["New line", "Shift + Enter"],
            ["Send", "Enter"],
          ]}
        />
        <p>
          <code>Enter</code> sends and <code>Shift + Enter</code> inserts a newline. On a phone keyboard,{" "}
          <code>Enter</code> always inserts a newline and the send button is used instead.
        </p>
      </Section>

      <Section title="Models">
        <ul>
          <li>
            <strong>Quick vs Thinking.</strong> Thinking spends more tokens and gives the model room to reason before
            answering. It is better for hard problems and slower and costlier for simple ones.
          </li>
          <li>
            <strong>Not every model can see images.</strong> If an image is ignored, the model you picked has no
            vision support. Pick one that does, or describe the image in text.
          </li>
          <li>
            <strong>Model list changes.</strong> The list is what the current provider offers. If a model you expect
            is missing, that is the provider&apos;s list, not this site.
          </li>
        </ul>
      </Section>

      <Section title="Images">
        <ul>
          <li>
            <strong>Paste an image URL into the composer</strong> and it is detected. A clickable card appears;
            clicking it sends the image to the model straight away, with a download and a convert-to-PDF option
            underneath.
          </li>
          <li>
            <strong>Upload an image</strong> with the <code>+</code> button. It is inlined for the model, which
            matters because many providers will not fetch a remote image themselves.
          </li>
          <li>
            <strong>Generated images</strong> can be downloaded directly, opened in the canvas, or varied. Some
            download as a file rather than a new tab, which is deliberate: pop-up previews are unreliable on
            phones.
          </li>
        </ul>
      </Section>

      <Section title="Files">
        <ul>
          <li>Up to 6 files at a time, 8&nbsp;MB each. Larger files are rejected rather than silently truncated.</li>
          <li>Documents are parsed to text on the server and that text is sent to the model; the file is not kept.</li>
          <li>
            If a PDF will not parse, it may be a scan with no text layer. The PDF tools can still convert pages to
            images.
          </li>
        </ul>
      </Section>

      <Section title="Web search and research">
        <p>
          Turning on <strong>Search</strong> sends your query to the provider&apos;s search endpoint so answers can
          cite current results. <strong>Research</strong> runs a longer multi-step process and reports how many web
          sources it used. Both are slower and cost more than a plain message, because they make additional requests.
        </p>
      </Section>

      <Section title="Sharing and exporting">
        <ul>
          <li>
            <strong>Share</strong> puts the whole conversation in the link, after the <code>#</code>. Anyone with
            the link can read it and it is not encrypted. Do not share a link containing anything sensitive, and
            generate a new one if the conversation changes.
          </li>
          <li>
            <strong>Export</strong> offers PDF, Markdown and a full JSON backup. All three are produced in your
            browser. The JSON backup is the only one that can be re-imported, so keep it if the history matters.
          </li>
        </ul>
      </Section>

      <Section title="Tools">
        <p>
          The tools in the <code>+</code> menu run entirely in your browser. Nothing is uploaded, and they work
          without a model or an API key.
        </p>
        <ul>
          <li>
            <strong>PDF.</strong> Images to PDF, with reordering, rotation, page size, orientation, margins and
            fit mode. PDF to images. Any text or document file to PDF. Both directions download the file directly
            rather than opening a print dialog, because print previews break on phones.
          </li>
          <li>
            <strong>Image.</strong> Download an image from a URL, and edit it.
          </li>
          <li>
            <strong>Colours.</strong> Convert between hex, RGB, HSL and HSV, check WCAG contrast against AA and
            AAA, generate a fix for a failing pair, and build tint and shade scales.
          </li>
          <li>
            <strong>QR codes.</strong> Real QR codes, not a lookalike, with error-correction levels and PNG or SVG
            export.
          </li>
          <li>
            <strong>URL tools.</strong> Parse a URL into its parts, and build one from fields, including its query
            string as text or as JSON.
          </li>
          <li>
            <strong>Data.</strong> Encoding and formatting helpers.
          </li>
          <li>
            <strong>Generate.</strong> Image generation, which does need a working provider connection.
          </li>
        </ul>
      </Section>

      <Section title="Sound, theme and profile">
        <ul>
          <li>
            <strong>Message sounds</strong> are synthesised in the browser, not downloaded. Browsers hold audio
            locked until you interact with the page, so the very first sound may need one click anywhere first.
          </li>
          <li>
            <strong>Theme</strong> follows your system by default and can be forced to light or dark.
          </li>
          <li>
            <strong>Your display name</strong> and <strong>real name</strong> are separate on purpose: the display
            name is what appears in the chat, the real name only on your profile. Both are stored locally.
          </li>
        </ul>
      </Section>

      <Section title="Accounts">
        <p>
          Signing in is optional. If the site has authentication configured you can sign in with Google, GitHub or an
          email address, which gives each account its own local data and lets you keep separate histories in one
          browser. Signing in does not move anything to a server; it namespaces what is already local.
        </p>
      </Section>

      <Section title="If something is wrong">
        <ul>
          <li>
            <strong>Replies never start.</strong> No usable API key. Check Settings, and check that the provider
            you chose actually serves the model you picked.
          </li>
          <li>
            <strong>Tools fail but chat works.</strong> The tools are local, so a tool failing is a bug here, not a
            provider problem. The Generate tab is the exception; it needs the provider.
          </li>
          <li>
            <strong>History vanished.</strong> Signing out, or clearing site data, or a different browser. There is no
            server copy to recover from.
          </li>
          <li>
            <strong>Layout looks wrong on a phone.</strong> Check for a browser zoom setting that is not 100%, and
            note that rotating or resizing mid-animation can leave a panel mid-transition; reloading clears it.
          </li>
          <li>
            <strong>Still stuck.</strong> <a href="/contact">Report it</a> with what you did, what you expected and
            what happened, plus your browser and device.
          </li>
        </ul>
      </Section>
    </LegalPage>
  );
}

function ShortcutTable({ rows }: { rows: [string, string][] }) {
  return (
    <div className="legal-table-wrap">
      <table className="legal-table">
        <thead>
          <tr>
            <th scope="col">Action</th>
            <th scope="col">Shortcut</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([a, k]) => (
            <tr key={a}>
              <td>{a}</td>
              <td>
                <kbd>{k}</kbd>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
