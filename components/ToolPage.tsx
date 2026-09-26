"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { TOOL_GROUPS, TOOL_META, type ToolBody, type ToolMeta } from "@/lib/toolMeta";
import { TOOL_ICONS } from "./toolIcons";
import { ChatGPTLogo } from "./Icons";
import { ColourTools, QrTools, UrlTools } from "./ToolTabs";
import { DataTools, GenerateTools, ImageTools, PdfTools } from "./ToolsPage";
import { useAuth } from "@/lib/useAuth";
import { DEFAULT_SETTINGS } from "@/lib/types";
import { SITE_NAME } from "@/lib/site";

/**
 * A single tool, on its own page.
 *
 * The old Tools panel grouped seven categories behind tabs, so getting to
 * "PDF to images" meant opening "PDF" and clicking again, and nothing had a URL
 * of its own. Every tool here is a real route: linkable, bookmarkable, in the
 * sitemap, and findable in search.
 *
 * The body is selected here rather than passed in from the server page. It was
 * originally a render prop, children being a (notify) => ReactNode built by the
 * server, and that cannot work: functions do not cross the server-to-client
 * boundary, and prerendering fails with "Functions cannot be passed directly to
 * Client Components". Selecting on this side makes notify an ordinary prop.
 *
 * Sign-in is read live through useAuth rather than hardcoded. GenerateTools
 * refuses to create an image when signedIn is false, so a constant here made
 * that tool's main function unreachable on its own page.
 */
export default function ToolPage({ tool }: { tool: ToolMeta }) {
  const router = useRouter();
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const notify = (m: string) => {
    setToast(m);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 2600);
  };

  return (
    <div className="tp2">
      <header className="tp2-bar">
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

      <div className="tp2-shell">
        {/*
          A rail rather than a row of chips. There are eleven tools in five
          groups now, and chips for all eleven wrap into three ragged lines on a
          phone. Grouped, the rail is scannable and has room for each label.
        */}
        <nav className="tp2-rail" aria-label="Tools">
          {TOOL_GROUPS.map((g) => (
            <div key={g} className="tp2-rail-group">
              <p className="tp2-rail-title">{g}</p>
              {TOOL_META.filter((t) => t.group === g).map((t) => {
                const Icon = TOOL_ICONS[t.id];
                const on = t.id === tool.id;
                return (
                  <Link
                    key={t.id}
                    href={`/tools/${t.id}`}
                    className={`tp2-link${on ? " on" : ""}`}
                    aria-current={on ? "page" : undefined}
                  >
                    <Icon size={15} />
                    <span>{t.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <main className="tp2-main">
          <header className="tp2-head">
            <p className="tp2-group">{tool.group}</p>
            <h1 className="tp2-title">{tool.label}</h1>
            <p className="tp2-blurb">{tool.blurb}</p>
          </header>

          <div className="tp2-card">{renderBody(tool, notify)}</div>

          <p className="tp2-note">
            Runs entirely in your browser. Nothing you enter is uploaded, and nothing is stored on a server.
          </p>
        </main>
      </div>

      {/*
        Kept mounted and toggled with opacity so it can transition, and
        pointer-events:none because an always-mounted element is otherwise a
        fixed box that swallows taps on whatever sits beneath it.
      */}
      <div className="toolpage-toast" role="status" aria-live="polite" style={{ opacity: toast ? 1 : 0 }}>
        {toast ?? ""}
      </div>
    </div>
  );
}

/** Which component, and which mode it opens in, for a given tool. */
function renderBody(tool: ToolMeta, notify: (m: string) => void) {
  switch (tool.body as ToolBody) {
    case "pdf":
      // The variant is the whole point of splitting these: the page opens on
      // the job it is named for, not on the first one in the tab.
      return <PdfTools notify={notify} initialDir={tool.variant as never} />;
    case "image":
      return <ImageTools notify={notify} initialDir={tool.variant as "edit" | "download"} />;
    case "colour":
      return <ColourTools />;
    case "qr":
      return <QrTools notify={notify} />;
    case "url":
      return <UrlTools notify={notify} />;
    case "data":
      return <DataTools notify={notify} />;
    case "generate":
      return <GenerateTool notify={notify} kind={tool.variant === "image" ? "image" : "doc"} />;
    default:
      return null;
  }
}

/**
 * Generation needs live auth and the saved credentials, which the plain
 * GenerateTools cannot get for itself. Kept here so the page stays one
 * component while the wiring stays in one place.
 */
function GenerateTool({ notify, kind }: { notify: (m: string) => void; kind: "doc" | "image" }) {
  const { signedIn, authAvailable, actions } = useAuth();
  const [creds, setCreds] = useState({
    model: DEFAULT_SETTINGS.model,
    apiKey: "",
    baseUrl: DEFAULT_SETTINGS.baseUrl,
  });
  const [loginOpen, setLoginOpen] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("chatgpt2.settings");
      if (!raw) return;
      const parsed = JSON.parse(raw) as { model?: string; apiKey?: string; baseUrl?: string };
      setCreds({
        model: parsed.model || DEFAULT_SETTINGS.model,
        apiKey: parsed.apiKey || "",
        baseUrl: parsed.baseUrl || DEFAULT_SETTINGS.baseUrl,
      });
    } catch {
      // The defaults already in state stand.
    }
  }, []);

  return (
    <GenerateTools
      model={creds.model}
      apiKey={creds.apiKey}
      baseUrl={creds.baseUrl}
      signedIn={signedIn}
      initialKind={kind}
      authAvailable={authAvailable}
      onOpenLogin={authAvailable ? () => setLoginOpen(true) : undefined}
      loginOpen={loginOpen}
      onCloseLogin={() => setLoginOpen(false)}
      onSignIn={actions.signIn}
      onSignInEmail={actions.signInEmail}
      onSignUpEmail={actions.signUpEmail}
      onResetPassword={actions.resetPassword}
      notify={notify}
    />
  );
}
