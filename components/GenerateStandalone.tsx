"use client";

import { useEffect, useState } from "react";
import { GenerateTools } from "./ToolsPage";
import { DEFAULT_SETTINGS } from "@/lib/types";
import { useAuth } from "@/lib/useAuth";

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
 * Auth state is read through the shared useAuth hook rather than hardcoded. It
 * has to be real: GenerateTools refuses to create an image when `signedIn` is
 * false, so passing a constant here made the tool's primary function unreachable
 * on this page. Passing the live phase lets it show the sign-in prompt the same
 * way the app does.
 *
 * Scoping: the app namespaces its settings per account as `chatgpt2.u.<uid>.*`.
 * A signed-in visitor's key therefore lives under a namespaced key this page
 * does not know to look for, so it reads the unscoped `chatgpt2.settings` only.
 * In practice a key saved while signed in is not picked up here; the server's
 * own key is used instead. Resolving that properly would mean tracking the uid
 * into the storage read, which is more machinery than a tool page should carry.
 */
export default function GenerateStandalone({ notify }: { notify: (m: string) => void }) {
  const { signedIn, authAvailable, actions } = useAuth();
  const [loginOpen, setLoginOpen] = useState(false);
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
      signedIn={signedIn}
      // False while auth is still resolving, and false when Firebase is not
      // configured at all. Either way the tool's own guard is the thing that
      // decides, so this only controls whether a sign-in hint can be offered.
      authAvailable={authAvailable}
      notify={notify}
      // Lets the tool offer sign-in from this page rather than only telling the
      // visitor to go and do it elsewhere.
      onOpenLogin={authAvailable ? () => setLoginOpen(true) : undefined}
      loginOpen={loginOpen}
      onCloseLogin={() => setLoginOpen(false)}
      onSignIn={actions.signIn}
      onSignInEmail={actions.signInEmail}
      onSignUpEmail={actions.signUpEmail}
      onResetPassword={actions.resetPassword}
    />
  );
}
