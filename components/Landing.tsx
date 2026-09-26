"use client";

import { useEffect, useState, type ReactElement } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Backdrop from "./Backdrop";
import { MODELS } from "@/lib/types";
import {
  ArrowIcon,
  CanvasIcon,
  ChatGPTLogo,
  ImageIcon,
  LibraryIcon,
  PdfIcon,
  ResearchIcon,
  SparkIcon,
  TemplateIcon,
  WrenchIcon,
} from "./Icons";

/**
 * Landing page.
 *
 * Shown at "/" to signed-out visitors; anyone with a session is sent straight
 * to /chat so they never see this twice. The app itself lives at /chat.
 *
 * Deliberately a single screen: a headline, the model picker, one button, and
 * an honest list of what it does. No fake testimonials or invented numbers.
 */

const CAPABILITIES: { title: string; body: string; icon: string }[] = [
  {
    title: "Real models, no demo",
    body: "Every answer comes from a live model. With no API key the server says so plainly instead of faking a reply.",
    icon: "◆",
  },
  {
    title: "Chat that remembers",
    body: "Conversations, projects and files stay in your browser, scoped to your account. Sign in to pick up on another device.",
    icon: "◈",
  },
  {
    title: "Documents and images",
    body: "Attach PDFs and documents, generate images, and convert anything to a real PDF that downloads straight to your device.",
    icon: "◇",
  },
  {
    title: "Standalone tools",
    body: "A page of utilities that need no account: colour contrast checks, QR codes, URL parsing, and CSV analysis in a sandbox.",
    icon: "◉",
  },
  {
    title: "Research and analysis",
    body: "Deep Research runs multi-step web research and returns a cited report. CSV analysis runs sandboxed JavaScript on your data.",
    icon: "◐",
  },
  {
    title: "Your data stays put",
    body: "Chats live in local storage. Nothing is uploaded except the prompts you send, and image files never leave the browser.",
    icon: "○",
  },
];

interface ToolItem {
  label: string;
  /** Where it lives in the app. `tools` opens the standalone page. */
  href: string;
}

interface ToolGroup {
  title: string;
  blurb: string;
  icon: (p: { size?: number }) => ReactElement;
  tone: string;
  items: ToolItem[];
}

/** Deep links: /chat?tools=<tab> opens the Tools page on that tab. */
const TOOL_GROUPS: ToolGroup[] = [
  {
    title: "Chat",
    blurb: "Everything about keeping track of a conversation.",
    icon: TemplateIcon,
    tone: "violet",
    items: [
      { label: "Projects", href: "/chat?settings=projects" },
      { label: "Custom instructions", href: "/chat?settings=general" },
      { label: "Pin and branch a reply", href: "/chat" },
      { label: "Tags", href: "/chat" },
      { label: "Search messages", href: "/chat" },
      { label: "Share a conversation", href: "/chat" },
      { label: "Quick and Thinking modes", href: "/chat" },
      { label: "Read aloud", href: "/chat" },
    ],
  },
  {
    title: "Images",
    blurb: "Make them, fetch them, shrink them, change their format.",
    icon: ImageIcon,
    tone: "teal",
    items: [
      { label: "Create an image", href: "/chat?img=1" },
      { label: "Download from a URL", href: "/chat?tools=image&dir=download" },
      { label: "Convert and resize", href: "/chat?tools=image" },
      { label: "Image variations", href: "/chat" },
      { label: "Library of past images", href: "/chat" },
    ],
  },
  {
    title: "Documents",
    blurb: "Real PDF files, downloaded straight to your device.",
    icon: PdfIcon,
    tone: "amber",
    items: [
      { label: "Anything to PDF", href: "/chat?tools=pdf" },
      { label: "Images to one PDF", href: "/chat?tools=pdf" },
      { label: "PDF to page images", href: "/chat?tools=pdf" },
      { label: "Export a chat as PDF", href: "/chat" },
      { label: "Attach PDF, DOCX or code", href: "/chat" },
    ],
  },
  {
    title: "Data",
    blurb: "Run code on your own data, with no upload.",
    icon: CanvasIcon,
    tone: "rose",
    items: [
      { label: "CSV analysis sandbox", href: "/chat?tools=data" },
      { label: "Canvas", href: "/chat" },
      { label: "Import and export chats", href: "/chat?settings=data" },
    ],
  },
  {
    title: "Utilities",
    blurb: "Small tools that need no account and no network.",
    icon: WrenchIcon,
    tone: "green",
    items: [
      { label: "Colour and contrast check", href: "/chat?tools=colour" },
      { label: "QR code generator", href: "/chat?tools=qr" },
      { label: "URL parser and builder", href: "/chat?tools=url" },
    ],
  },
  {
    title: "Research",
    blurb: "Go and look things up properly.",
    icon: ResearchIcon,
    tone: "accent",
    items: [
      { label: "Deep Research", href: "/chat" },
      { label: "Web search", href: "/chat" },
      { label: "Calculator and converters", href: "/chat" },
    ],
  },
];

export default function Landing() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [model, setModel] = useState<string>("");
  const [modelOpen, setModelOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 60, left: 16, up: false });

  /**
   * Keep the menu on screen: clamp it horizontally, and flip it above the
   * button when there is not enough room below, which is what happens on short
   * or landscape phone screens.
   */
  const placeMenu = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const width = Math.min(330, window.innerWidth - 24);
    const left = Math.min(Math.max(12, r.left), Math.max(12, window.innerWidth - width - 12));
    const estimated = Math.min(420, window.innerHeight * 0.6);
    const up = window.innerHeight - r.bottom - 8 < estimated;
    setMenuPos({ top: up ? r.top - estimated - 8 : r.bottom + 8, left, up });
  };

  // Someone signed in has no business on the landing page.
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const { getFirebaseAuth } = await import("@/lib/firebase");
        const auth = await getFirebaseAuth();
        const unsubscribe = auth.onAuthStateChanged((u) => {
          if (!live) return;
          if (u) router.replace("/chat");
        });
        return () => {
          live = false;
          unsubscribe();
        };
      } catch {
        // Firebase not configured: this site runs anonymously, so stay put.
      } finally {
        if (live) setChecking(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [router]);

  // Default to the user's saved model so the picker is not arbitrary.
  useEffect(() => {
    try {
      const raw = localStorage.getItem("chatgpt2.settings");
      if (raw) {
        const parsed = JSON.parse(raw) as { model?: string };
        if (parsed.model && MODELS.some((m) => m.id === parsed.model)) setModel(parsed.model);
      }
    } catch {
      /* ignore malformed settings */
    }
  }, []);

  const chosen = MODELS.find((m) => m.id === model) ?? MODELS[0];

  const start = () => {
    try {
      if (model) {
        const raw = localStorage.getItem("chatgpt2.settings");
        const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
        localStorage.setItem("chatgpt2.settings", JSON.stringify({ ...parsed, model }));
      }
    } catch {
      /* settings are a nicety, not a blocker */
    }
    router.push("/chat");
  };

  return (
    <div className="landing">
      {/* Shared animated backdrop; see components/Backdrop.tsx. */}
      <Backdrop variant="landing" />

      <header className="land-bar">
        <div className="land-brand">
          <ChatGPTLogo size={22} />
          <span>Next AI</span>
        </div>
        <div className="land-bar-right">
          <a className="land-link" href="#what">
            What it does
          </a>
          <a className="land-link" href="#tools">
            All tools
          </a>
          <button type="button" className="land-btn ghost sm" onClick={() => router.push("/chat")}>
            Open the app
          </button>
        </div>
      </header>

      <main className="land-main">
        <p className="land-eyebrow">
          <SparkIcon size={14} />
          Powered by xKiro
        </p>
        <h1 className="land-title">
          A chat client that
          <br />
          <span className="land-title-accent">tells you the truth.</span>
        </h1>
        <p className="land-sub">
          Streaming answers, Markdown, file attachments, image generation, deep research and a page of standalone tools.
          No fake replies, no invented answers — if something is not configured, it says so.
        </p>

        <div className="land-cta">
          <div className="land-model">
            <button
              type="button"
              className="land-model-btn"
              onClick={(e) => {
                placeMenu(e.currentTarget);
                setModelOpen((v) => !v);
              }}
              aria-haspopup="listbox"
              aria-expanded={modelOpen}
            >
              <span className="land-model-label">{chosen.name}</span>
              <span className="land-model-tag">{chosen.tag}</span>
              <span className="land-caret" aria-hidden="true">
                ▾
              </span>
            </button>
            {modelOpen ? (
              <>
                <div className="land-menu-backdrop" onClick={() => setModelOpen(false)} />
                <div
                  className={`land-model-menu${menuPos.up ? " up" : ""}`}
                  style={{ top: menuPos.top, left: menuPos.left }}
                  role="listbox"
                  aria-label="Choose a model"
                >
                  {MODELS.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      role="option"
                      aria-selected={m.id === chosen.id}
                      className={`land-model-item${m.id === chosen.id ? " sel" : ""}`}
                      onClick={() => {
                        setModel(m.id);
                        setModelOpen(false);
                      }}
                    >
                      <span>
                        <b>{m.name}</b>
                        <em>{m.desc}</em>
                      </span>
                      <i>{m.tag}</i>
                    </button>
                  ))}
                </div>
              </>
            ) : null}
          </div>

          <button type="button" className="land-btn primary" onClick={start} disabled={checking}>
            Start chatting
            <ArrowIcon size={16} />
          </button>
        </div>

        <p className="land-note">No account needed to try it. Sign in later to keep your history separate.</p>
      </main>

      <section className="land-caps" id="what">
        {CAPABILITIES.map((c) => (
          <article key={c.title} className="land-cap">
            <span className="land-cap-icon" aria-hidden="true">
              {c.icon}
            </span>
            <h2>{c.title}</h2>
            <p>{c.body}</p>
          </article>
        ))}
      </section>

      <section className="land-tools" id="tools">
        <header className="land-tools-head">
          <p className="land-eyebrow">Everything included</p>
          <h2>All the tools, in one list</h2>
          <p className="land-tools-sub">
            No tiers, no credits, no upsell. Every one of these is in the app you are about to open, and most work without
            signing in.
          </p>
        </header>

        <div className="land-tool-grid">
          {TOOL_GROUPS.map((g) => {
            const Icon = g.icon;
            return (
              <article key={g.title} className={`land-tool-group tone-${g.tone}`}>
                <header className="land-tool-head">
                  <span className="land-tool-mark" aria-hidden="true">
                    <Icon size={17} />
                  </span>
                  <div>
                    <h3>{g.title}</h3>
                    <p className="land-tool-blurb">{g.blurb}</p>
                  </div>
                </header>
                <ul>
                  {g.items.map((item) => (
                    <li key={item.label}>
                      <Link href={item.href} className="land-tool-link">
                        <span>{item.label}</span>
                        <span className="land-tool-arrow" aria-hidden="true">
                          →
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>
      </section>

      <footer className="land-foot">
        <span>Next AI</span>
        <span>Runs entirely in your browser. No tracking, no accounts required.</span>
      </footer>
    </div>
  );
}
