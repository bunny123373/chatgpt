"use client";

import { useEffect, useState } from "react";
import { ChatGPTLogo } from "./Icons";

interface Props {
  onSignIn: (provider: "google" | "github") => Promise<void>;
  onSignInEmail: (email: string, password: string) => Promise<string | null>;
  onSignUpEmail: (name: string, email: string, password: string) => Promise<{ verify: boolean }>;
  onResetPassword: (email: string) => Promise<void>;
  /** "modal" renders as a dismissible overlay; "gate" fills the screen. */
  variant?: "modal" | "gate";
  onClose?: () => void;
  onSignedIn?: () => void;
}

type Mode = "signin" | "signup" | "reset";

function tipFor(code: string): string | null {
  switch (code) {
    case "auth/operation-not-supported-in-this-environment":
      return "That sign-in method isn't enabled yet. In the Firebase console open Authentication → Sign-in method and turn on Google/GitHub.";
    case "auth/unauthorized-domain":
      return "This address isn't on Firebase's authorized domains list. Add it under Authentication → Settings → Authorized domains.";
    case "auth/popup-blocked-by-browser":
      return "Your browser blocked the sign-in popup — allow popups for this site and try again.";
    case "auth/popup-closed-by-user":
      return null;
    case "auth/account-exists-with-different-credential":
      return "That email is already linked to another sign-in method. Use that method instead.";
    // ---- email / password ----
    case "auth/email-already-in-use":
      return "An account with that email already exists. Try signing in instead.";
    case "auth/invalid-email":
      return "That email address doesn't look right.";
    case "auth/missing-password":
      return "Enter your password.";
    case "auth/weak-password":
      return "Passwords need at least 6 characters.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
    case "auth/invalid-login-credentials":
      return "Wrong email or password.";
    case "auth/too-many-requests":
      return "Too many attempts. Wait a minute and try again.";
    case "auth/network-request-failed":
      return "Network error — check your connection and try again.";
    default:
      return null;
  }
}

export default function LoginScreen({
  onSignIn,
  onSignInEmail,
  onSignUpEmail,
  onResetPassword,
  variant = "gate",
  onClose,
  onSignedIn,
}: Props) {
  const [mode, setMode] = useState<Mode>("signin");
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState<"google" | "github" | "email" | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);

  // Escape closes the modal variant.
  useEffect(() => {
    if (variant !== "modal" || !onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [variant, onClose]);

  const reset = () => {
    setErr(null);
    setOk(null);
  };

  const run = async (provider: "google" | "github") => {
    reset();
    setBusy(provider);
    try {
      await onSignIn(provider);
      onSignedIn?.();
    } catch (e) {
      const code = (e as { code?: string })?.code ?? (e as { message?: string })?.message ?? "Sign-in failed";
      const tip = tipFor(code);
      setErr(tip ?? "Couldn't sign in. Check the Firebase console (Authentication → Sign-in method) and try again.");
    } finally {
      setBusy(null);
    }
  };

  const submitEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    reset();

    if (!email.trim()) return setErr("Enter your email address.");
    if (mode !== "reset" && password.length < 6) return setErr("Passwords need at least 6 characters.");

    setBusy("email");
    try {
      if (mode === "signin") {
        await onSignInEmail(email, password);
        onSignedIn?.();
        // onAuthStateChanged swaps the screen.
      } else if (mode === "signup") {
        const { verify } = await onSignUpEmail(name, email, password);
        setOk(
          verify
            ? "Account created. Check your inbox to verify the address, then sign in."
            : "Account created. You can sign in now."
        );
        setMode("signin");
        setPassword("");
      } else {
        await onResetPassword(email);
        setOk("If that email has an account, a password-reset link is on its way.");
        setMode("signin");
      }
    } catch (err) {
      const code = (err as { code?: string })?.code ?? (err as { message?: string })?.message ?? "Something went wrong";
      setErr(tipFor(code) ?? "That didn't work. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const heading =
    mode === "signup" ? "Create your account" : mode === "reset" ? "Reset password" : "Get responses tailored to you";

  const sub =
    mode === "signup"
      ? "Sign up to continue to Next AI"
      : mode === "reset"
        ? "We'll email you a link to choose a new password"
        : "Log in to get answers based on saved chats, plus create images and upload files.";

  const body = (
    <div className="auth-inner">
      {variant === "modal" ? (
        <button className="auth-close" type="button" onClick={onClose} title="Close" aria-label="Close sign in">
          ✕
        </button>
      ) : null}

      <div className="auth-logo">
        <ChatGPTLogo size={42} />
      </div>

      <h1>{heading}</h1>
      <p className="auth-sub">{sub}</p>

        {mode === "reset" ? (
          <form className="auth-form" onSubmit={submitEmail}>
            <label className="auth-label" htmlFor="auth-email">
              Email
            </label>
            <input
              id="auth-email"
              className="auth-input"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
            />
            <button className="auth-submit" type="submit" disabled={busy !== null}>
              {busy === "email" ? "Sending…" : "Send reset link"}
            </button>
            <button className="auth-link" type="button" onClick={() => { reset(); setMode("signin"); }}>
              ← Back to sign in
            </button>
          </form>
        ) : (
          <form className="auth-form" onSubmit={submitEmail}>
            {mode === "signup" ? (
              <>
                <label className="auth-label" htmlFor="auth-name">
                  Name
                </label>
                <input
                  id="auth-name"
                  className="auth-input"
                  type="text"
                  autoComplete="name"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </>
            ) : null}

            <label className="auth-label" htmlFor="auth-email">
              Email
            </label>
            <input
              id="auth-email"
              className="auth-input"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <div className="auth-label-row">
              <label className="auth-label" htmlFor="auth-password">
                Password
              </label>
              {mode === "signin" ? (
                <button className="auth-link tiny" type="button" onClick={() => { reset(); setMode("reset"); }}>
                  Forgot password?
                </button>
              ) : null}
            </div>
            <div className="auth-pw">
              <input
                id="auth-password"
                className="auth-input"
                type={showPw ? "text" : "password"}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                placeholder={mode === "signup" ? "At least 6 characters" : "••••••••"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                className="auth-eye"
                type="button"
                onClick={() => setShowPw((v) => !v)}
                title={showPw ? "Hide password" : "Show password"}
                aria-label={showPw ? "Hide password" : "Show password"}
              >
                {showPw ? "Hide" : "Show"}
              </button>
            </div>

            <button className="auth-submit" type="submit" disabled={busy !== null}>
              {busy === "email"
                ? mode === "signup"
                  ? "Creating account…"
                  : "Signing in…"
                : mode === "signup"
                  ? "Create account"
                  : "Sign in"}
            </button>
          </form>
        )}

        <div className="auth-or">
          <span>or continue with</span>
        </div>

        <div className="auth-buttons">
          <button type="button" className="provider-btn" disabled={busy !== null} onClick={() => run("google")}>
            <GoogleGlyph />
            <span>{busy === "google" ? "Signing in…" : "Continue with Google"}</span>
          </button>

          <button type="button" className="provider-btn" disabled={busy !== null} onClick={() => run("github")}>
            <GithubGlyph />
            <span>{busy === "github" ? "Signing in…" : "Continue with GitHub"}</span>
          </button>
        </div>

        {err ? (
          <p className="auth-err" role="alert">
            {err}
          </p>
        ) : null}
        {ok ? (
          <p className="auth-ok" role="status">
            {ok}
          </p>
        ) : null}

        <p className="auth-switch">
          {mode === "signup" ? (
            <>
              Already have an account?{" "}
              <button
                className="auth-link"
                type="button"
                onClick={() => {
                  reset();
                  setMode("signin");
                }}
              >
                Sign in
              </button>
            </>
          ) : (
            <>
              New here?{" "}
              <button
                className="auth-link"
                type="button"
                onClick={() => {
                  reset();
                  setMode("signup");
                }}
              >
                Create an account
              </button>
            </>
          )}
        </p>

        <p className="auth-note">
          {variant === "modal"
            ? "You can keep using Next AI without an account — chats stay in this browser."
            : "Conversations are stored in this browser and tied to your account — sign out to switch users."}
        </p>
    </div>
  );

  if (variant === "gate") {
    return <div className="auth-wrap">{body}</div>;
  }

  return (
    <div
      className="auth-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="scale-in" role="dialog" aria-modal="true" aria-label="Log in">
        {body}
      </div>
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

function GithubGlyph() {
  return (
    <svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}
