import type { Metadata } from "next";
import LegalPage, { Section } from "@/components/LegalPage";
import { CONTACT_EMAIL, ISSUES_URL, REPO_URL, SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: `Contact — ${SITE_NAME}`,
  description: `Report a bug, ask a question or request a feature for ${SITE_NAME}.`,
  alternates: { canonical: "/contact" },
  openGraph: {
    title: `Contact — ${SITE_NAME}`,
    description: "Report a bug, ask a question, or request a feature.",
    url: "/contact",
  },
};

export default function ContactPage() {
  return (
    <LegalPage
      title="Contact"
      intro="One channel, and it is monitored. There is no support ticket queue and no chatbot; a human reads what you send."
    >
      <Section title="Report a problem">
        <p>
          The fastest route is the public issue tracker. It needs no account, it is searchable, and a fix that helps
          someone else will be visible to them.
        </p>
        <p>
          <a className="legal-cta" href={ISSUES_URL} target="_blank" rel="noreferrer noopener">
            Open an issue
          </a>
        </p>
        <p>
          A good report needs three things: what you did, what you expected, and what happened instead. The browser
          and device matter, and so does whether you are signed in. If something failed while talking to a model,
          the exact error text saves a round trip.
        </p>
      </Section>

      <Section title="Before you report it">
        <p>
          Most reports fall into a few known shapes, and <a href="/help">Help</a> covers them. In particular: a
          model refusing to answer usually means no usable API key is configured, and tools failing while the chat
          works usually means the upstream provider is rejecting the request.
        </p>
      </Section>

      <Section title="Privacy and data requests">
        <p>
          There is very little to request, because conversations are stored in your browser rather than on a server.
          You can export every chat from Settings, or erase everything by clearing this site&apos;s data in your
          browser.
        </p>
        <p>
          For anything that reached a model provider, that provider holds it under their own policy and we cannot
          delete it on your behalf. The <a href="/privacy">Data &amp; privacy</a> page sets out exactly who holds
          what.
        </p>
      </Section>

      <Section title="Security reports">
        <p>
          If you believe you have found a vulnerability, please report it privately through the issue tracker
          rather than in a public thread, and give the maintainers a reasonable window to fix it before disclosing.
        </p>
      </Section>

      <Section title="Other channels">
        <DataList
          items={[
            { label: "Source code", value: REPO_URL, href: REPO_URL, note: "Every change in this site's behaviour is a commit you can read." },
            { label: "Issues", value: ISSUES_URL, href: ISSUES_URL, note: "Bugs, questions and feature requests." },
            ...(CONTACT_EMAIL
              ? [{ label: "Email", value: CONTACT_EMAIL, href: `mailto:${CONTACT_EMAIL}`, note: "Monitored address." }]
              : []),
          ]}
        />
      </Section>
    </LegalPage>
  );
}

function DataList({
  items,
}: {
  items: { label: string; value: string; href: string; note: string }[];
}) {
  return (
    <dl className="legal-dl">
      {items.map((i) => (
        <div key={i.label}>
          <dt>{i.label}</dt>
          <dd>
            <a href={i.href} target={i.href.startsWith("http") ? "_blank" : undefined} rel="noreferrer noopener">
              {i.value}
            </a>
            <small>{i.note}</small>
          </dd>
        </div>
      ))}
    </dl>
  );
}
