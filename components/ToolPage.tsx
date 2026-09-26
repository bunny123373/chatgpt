"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { TOOL_META, type ToolMeta } from "@/lib/toolMeta";
import { TOOL_ICONS } from "./toolIcons";
import { ChatGPTLogo } from "./Icons";
import { ColourTools, QrTools, UrlTools } from "./ToolTabs";
import { DataTools, PdfTools } from "./ToolsPage";
import GenerateStandalone from "./GenerateStandalone";
import ImageToolsStandalone from "./ImageToolsStandalone";
import { SITE_NAME } from "@/lib/site";

/**
 * Shell for a single tool at /tools/<id>.
 *
 * Every tool gets its own URL rather than living behind the in-chat Tools panel.
 * A tool is a page, not a modal: it should be linkable, bookmarkable, shareable
 * and reachable from search, and reaching one should not drop you into a
 * conversation first. The panel in the app stays, because inside a chat the
 * tools are convenient, but nothing forces you through it.
 *
 * The tool body is chosen here rather than passed in. This was originally a
 * render prop -- children was a (notify) => ReactNode supplied by the server
 * page -- and that cannot work: a function cannot cross the server-to-client
 * boundary, and the build fails while prerendering with "Functions cannot be
 * passed directly to Client Components". Selecting the body on this side means
 * the server page passes only a plain serialisable object, and notify is just
 * an ordinary prop handed to a client component, which is allowed.
 */
export default function ToolPage({ tool }: { tool: ToolMeta }) {
  const router = useRouter();
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear a pending hide on unmount. Without this, navigating away within the
  // 2.6s window sets state on an unmounted component.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  /**
   * Standalone pages have no app shell to host a toast, so this renders an
   * inline one. The ref keeps the previous timer so a burst of messages
   * replaces rather than stacks.
   */
  const notify = (m: string) => {
    setToast(m);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 2600);
  };

  return (
    <div className="toolpage">
      <header className="toolpage-bar">
        <Link href="/" className="land-brand" aria-label={`${SITE_NAME} home`}>
          <ChatGPTLogo size={20} />
          <span>{SITE_NAME}</span>
        </Link>
        <div className="land-bar-right">
          <Link href="/chat" className="land-link">
            Chat
          </Link>
          <Link href="/help" className="land-link">
            Help
          </Link>
          <button type="button" className="land-btn sm" onClick={() => router.push("/chat")}>
            Open the app
          </button>
        </div>
      </header>

      <main className="toolpage-main">
        <div className="toolpage-head">
          <h1 className="toolpage-title">{tool.label}</h1>
          <p className="toolpage-blurb">{tool.blurb}</p>
        </div>

        {/* Every tool, so one is always a click away. `aria-current` marks the
            page you are on instead of implying a click will do something. */}
        <nav className="toolpage-nav" aria-label="Tools">
          {TOOL_META.map((t) => {
            const Icon = TOOL_ICONS[t.id];
            const on = t.id === tool.id;
            return (
              <Link
                key={t.id}
                href={`/tools/${t.id}`}
                className={`toolpage-chip${on ? " on" : ""}`}
                aria-current={on ? "page" : undefined}
                title={t.blurb}
              >
                <Icon size={15} />
                <span>{t.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="toolpage-body">{body(tool.id, notify)}</div>

        <p className="toolpage-note">
          This tool runs entirely in your browser. Nothing you enter is uploaded.
        </p>
      </main>

      {/*
        Fixed rather than absolute so it does not scroll away under a long tool.
        Kept mounted and toggled with opacity, because an element that is added
        and removed cannot transition.
      */}
      <div className="toolpage-toast" role="status" aria-live="polite" style={{ opacity: toast ? 1 : 0 }}>
        {toast ?? ""}
      </div>
    </div>
  );
}

/** The tool body for an id. Total over ToolId, so a new tool fails to compile. */
function body(id: ToolMeta["id"], notify: (m: string) => void) {
  switch (id) {
    case "pdf":
      return <PdfTools notify={notify} />;
    case "image":
      return <ImageToolsStandalone notify={notify} />;
    case "colour":
      return <ColourTools />;
    case "qr":
      return <QrTools notify={notify} />;
    case "url":
      return <UrlTools notify={notify} />;
    case "data":
      return <DataTools notify={notify} />;
    case "make":
      return <GenerateStandalone notify={notify} />;
    default:
      return null;
  }
}
