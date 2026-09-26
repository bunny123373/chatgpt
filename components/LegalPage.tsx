"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { ChatGPTLogo } from "./Icons";
import { CONTACT_EMAIL, ISSUES_URL, POLICY_REVISED, REPO_URL, SITE_NAME } from "@/lib/site";

/**
 * Shell for the four static content pages: privacy, terms, contact, help.
 *
 * They are client components only because of the back button and the router
 * push. The content itself is static and safe to prerender.
 */
export default function LegalPage({
  title,
  intro,
  updated,
  children,
}: {
  title: string;
  intro: string;
  updated?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  return (
    <div className="legal">
      <header className="legal-bar">
        <Link href="/" className="land-brand" aria-label={`${SITE_NAME} home`}>
          <ChatGPTLogo size={20} />
          <span>{SITE_NAME}</span>
        </Link>
        <div className="land-bar-right">
          <Link href="/help" className="land-link">
            Help
          </Link>
          <Link href="/privacy" className="land-link">
            Privacy
          </Link>
          <Link href="/terms" className="land-link">
            Terms
          </Link>
          <Link href="/contact" className="land-link">
            Contact
          </Link>
          <button type="button" className="land-btn ghost sm" onClick={() => router.push("/chat")}>
            Open the app
          </button>
        </div>
      </header>

      <main className="legal-body">
        <h1 className="legal-title">{title}</h1>
        {intro ? <p className="legal-intro">{intro}</p> : null}
        {updated ? <p className="legal-updated">Last updated {updated}</p> : null}
        <div className="legal-content">{children}</div>

        <nav className="legal-foot" aria-label="Policy pages">
          <Link href="/privacy">Data &amp; privacy</Link>
          <span aria-hidden>·</span>
          <Link href="/terms">Terms</Link>
          <span aria-hidden>·</span>
          <Link href="/contact">Contact</Link>
          <span aria-hidden>·</span>
          <Link href="/help">Help</Link>
        </nav>
      </main>

      <footer className="legal-footer">
        <p>
          {SITE_NAME}. Not affiliated with OpenAI. Model names and logos belong to their respective owners.
        </p>
        <p>
          <a href={REPO_URL} target="_blank" rel="noreferrer noopener">
            Source
          </a>
          <span aria-hidden> · </span>
          <a href={ISSUES_URL} target="_blank" rel="noreferrer noopener">
            Report a problem
          </a>
          {CONTACT_EMAIL ? (
            <>
              <span aria-hidden> · </span>
              <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
            </>
          ) : null}
        </p>
      </footer>
    </div>
  );
}

/** A titled block, so the pages read as documents rather than a wall of text. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="legal-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

/**
 * A short table of data flows. Deliberately a real table rather than prose:
 * "what goes where" is the one thing a reader is actually looking for, and it
 * should be scannable.
 */
export function DataTable({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="legal-table-wrap">
      <table className="legal-table">
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r[0]}>
              {r.map((c, i) => (
                <td key={i}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
