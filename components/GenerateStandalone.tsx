"use client";

import { useEffect, useState } from "react";
import { GenerateTools } from "./ToolsPage";
import { DEFAULT_SETTINGS } from "@/lib/types";

/**
 * Image generation on a standalone /tools/make page.
 *
 * The generator is the one tool that is not purely local: it needs a model, and
 * optionally a key and a base URL, and on a standalone page there is no app
 * shell holding them in props.
 *
 * So it reads the same settings blob the app writes, rather than asking for them
 * again. A visitor who has already configured a key in the chat finds generation
 * working here with no second setup step, which is the behaviour people expect.
 * A visitor who has not gets the defaults, and the server's own key is used.
 *
 * Scoping: the app namespaces its settings per account as
 * `chatgpt2.u.<uid>.*`, and a standalone page has no auth context to resolve
 * which namespace applies. So this reads the unscoped `chatgpt2.settings` only.
 * The practical effect is that a key saved while signed in is not picked up
 * here. Resolving that properly would mean wiring useAuth into this page, which
 * is more machinery than a tool page should carry; the honest fix is for the
 * page to say which it read.
 */
export default function GenerateStandalone({ notify }: { notify: (m: string) => void }) {
  const [creds, setCreds] = useState({
    model: DEFAULT_SETTINGS.model,
    apiKey: "",
    baseUrl: DEFAULT_SETTINGS.baseUrl,
  });

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("chatgpt2.settings");
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        model?: string;
        apiKey?: string;
        baseUrl?: string;
      };
      setCreds({
        model: parsed.model || DEFAULT_SETTINGS.model,
        apiKey: parsed.apiKey || "",
        baseUrl: parsed.baseUrl || DEFAULT_SETTINGS.baseUrl,
      });
    } catch {
      // Malformed or unavailable storage: the defaults already in state stand.
    }
  }, []);

  return (
    <GenerateTools
      model={creds.model}
      apiKey={creds.apiKey}
      baseUrl={creds.baseUrl}
      // No auth context here, so the signed-in-only affordances stay hidden.
      signedIn={false}
      notify={notify}
    />
  );
}
