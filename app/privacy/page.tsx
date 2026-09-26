import type { Metadata } from "next";
import LegalPage, { DataTable, Section } from "@/components/LegalPage";
import { POLICY_REVISED, SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: `Data & privacy — ${SITE_NAME}`,
  description:
    "Exactly what Next AI stores, what leaves your device, and who sees it. No analytics, no advertising, no server-side database of your conversations.",
  alternates: { canonical: "/privacy" },
  openGraph: {
    title: `Data & privacy — ${SITE_NAME}`,
    description: "What we store, what leaves your device, and who sees it.",
    url: "/privacy",
    type: "article",
  },
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Data & privacy"
      intro={`${SITE_NAME} is built so that your conversations are not collected. This page describes what actually happens to your data, in plain terms, based on how the software works rather than on what a policy is normally expected to say.`}
      updated={POLICY_REVISED}
    >
      <Section title="The short version">
        <ul>
          <li>
            <strong>Your chats are stored in your own browser</strong>, not on a server. There is no database of
            conversations.
          </li>
          <li>
            <strong>There is no analytics, no advertising and no tracking</strong> of any kind. No third-party
            scripts, no pixels, no profiling.
          </li>
          <li>
            <strong>What you send to a model has to reach a model.</strong> Your message, any images and any
            attached files are relayed to whichever AI provider you have configured. That provider's handling of
            it is their policy, not ours.
          </li>
          <li>
            <strong>An API key is involved.</strong> Either one you enter yourself, or one our server supplies.
            Either way it is a secret and it is treated as one.
          </li>
        </ul>
      </Section>

      <Section title="What is stored, and where">
        <p>
          Everything is kept in your browser&apos;s <code>localStorage</code>. Nothing is written to a server database.
          The keys are namespaced per account, so signing in on a shared browser keeps each account&apos;s data
          separate.
        </p>
        <DataTable
          head={["Stored locally", "What it holds"]}
          rows={[
            ["Chats", "Every message, including attached images and generated images, as base64 data URLs."],
            ["Projects", "Project names, colours and their references to chats."],
            ["Settings", "Model, theme, bubble colour, temperature, and your API key if you entered one."],
            ["Prompt templates", "Any prompts you have saved."],
            ["Interface state", "Whether the sidebar is open, read-aloud voice and speed."],
          ]}
        />
        <p>
          <strong>Consequences worth understanding.</strong> Because this is browser storage:
        </p>
        <ul>
          <li>Clearing your browser data, or using private browsing, deletes it. There is no server copy to restore from.</li>
          <li>It is tied to the browser and the account, not to a sync service. It does not follow you to another device.</li>
          <li>
            It is readable by anything with access to your browser profile, including browser extensions. Treat a
            shared or compromised machine as compromised.
          </li>
        </ul>
      </Section>

      <Section title="What leaves your device">
        <p>
          Running a language model is not something a website can do on its own, so parts of your data are relayed
          through our server to whichever provider you configured. This is the complete list.
        </p>
        <DataTable
          head={["When you…", "What is sent, and to whom"]}
          rows={[
            [
              "Send a message",
              "The message text, your system prompt, your saved instructions, and the conversation so far, to the configured model provider. If you attach an image it is inlined and sent too.",
            ],
            [
              "Attach a file",
              "The file, up to 8&nbsp;MB each and 6 files at a time, is parsed to text on our server and that text is sent to the model. The file itself is not stored.",
            ],
            [
              "Turn on web search",
              "Your query is sent to the search endpoint of your provider so it can look results up.",
            ],
            [
              "Generate an image",
              "Your prompt, and any image you asked it to vary, are sent to the image model.",
            ],
            [
              "Use read-aloud",
              "The text to be spoken is sent to the provider's speech endpoint to produce audio.",
            ],
            [
              "Use the image downloader",
              "The image URL you supply is fetched by our server so it can be saved directly. We do not keep the image.",
            ],
            [
              "Use a tool",
              "Tools such as PDF, QR, colour and URL work entirely in your browser. Nothing is uploaded.",
            ],
          ]}
        />
        <p>
          If you have not entered your own API key, requests are made using a key held in our server environment. If
          you have entered one, it is stored in your browser and forwarded with each request. In both cases the
          content still goes to the provider.
        </p>
      </Section>

      <Section title="Share links are public documents">
        <p>
          The <strong>Share</strong> button compresses the entire conversation into the link itself, after the{" "}
          <code>#</code>. Nothing is stored on a server. Anyone who has the link can read the conversation, and the
          contents are not encrypted. Treat a share link like an email: do not send one containing anything you
          would not send in plain text, and generate a new one if the old conversation changes.
        </p>
      </Section>

      <Section title="Who else is involved">
        <DataTable
          head={["Party", "Role", "What they receive"]}
          rows={[
            [
              "Model provider (for example xKiro)",
              "Runs the model, search, image and speech services you use.",
              "Your prompts, messages, attached images, extracted file text, and your API key.",
            ],
            ["Vercel", "Hosts this site and serves the API routes.", "Ordinary request metadata such as IP address, user agent and timing."],
            [
              "Google Firebase",
              "Sign-in only, and only if the site is configured for accounts.",
              "Your email address or Google/GitHub identity, if you choose to sign in. No conversation data.",
            ],
            [
              "Google or GitHub",
              "Social sign-in, if you use it.",
              "Your identity, at the point you choose to sign in with them.",
            ],
          ]}
        />
        <p>
          We do not sell data, and we have no third-party advertising or analytics partners. Providers beyond those
          listed above are not used; if that ever changes, this page changes first.
        </p>
      </Section>

      <Section title="Cookies">
        <p>
          This application sets no cookies of its own and runs no advertising or analytics cookies. If sign-in is
          enabled, Firebase Authentication stores session tokens in your browser so you stay signed in; that is
          authentication state, not tracking.
        </p>
      </Section>

      <Section title="Deleting your data">
        <ul>
          <li>Delete a single chat with its delete button, or clear everything from Settings.</li>
          <li>Sign out, then clear this site&apos;s data in your browser settings. That removes all local keys.</li>
          <li>
            Because nothing is stored on our servers, there is nothing for us to delete afterwards. That is the
            intended behaviour, and also its main limitation.
          </li>
        </ul>
      </Section>

      <Section title="Children">
        <p>
          This is a general-audience developer tool and is not directed at children. We do not knowingly collect
          information from children, and because we collect no personal information from anyone, we hold none that
          would need to be deleted on request.
        </p>
      </Section>

      <Section title="Your rights">
        <p>
          Depending on where you live, you may have rights to access, correct, export or erase personal data about
          you, and to object to processing. In practice almost all of it sits in your browser, so you can exercise
          those rights directly: export your chats from Settings, or clear the site data. For anything that reached
          a model provider, that provider holds it under their policy, and we have no means to delete it for you.
        </p>
        <p>
          If you have a question or a request, use the <a href="/contact">contact page</a>.
        </p>
      </Section>

      <Section title="Changes to this policy">
        <p>
          If the behaviour described here changes, this page is updated and the date at the top changes with it.
          Because the point of this document is to be a description of what the software does, it should be read
          alongside the source, which is{" "}
          <a href="https://github.com/bunny123373/chatgpt" target="_blank" rel="noreferrer noopener">
            public
          </a>
          .
        </p>
      </Section>
    </LegalPage>
  );
}
