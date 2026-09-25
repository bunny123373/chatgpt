"use client";

import { useEffect, useState } from "react";
import type { Auth, User } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";
import type { AuthUser } from "@/lib/types";
import ChatApp from "./ChatApp";
import LoginScreen from "./LoginScreen";

type Phase =
  | { status: "boot" }
  | { status: "anon" }
  | { status: "signedOut" }
  | { status: "signedIn"; user: AuthUser };

function toAuthUser(u: User): AuthUser {
  return {
    uid: u.uid,
    name: u.displayName || u.email?.split("@")[0] || "User",
    email: u.email || "",
    image: u.photoURL || null,
  };
}

/**
 * Authentication (no gate):
 *  - The app ALWAYS renders — nobody is forced to log in.
 *  - Signed out  → anonymous data (`chatgpt2.*`), "Log in" offered in the sidebar.
 *  - Signed in   → per-account data (`chatgpt2.u.<uid>.*`), sign-out in the sidebar.
 *  - No Firebase config → anonymous mode, the Log in button stays hidden.
 */
export default function AuthGate() {
  const [phase, setPhase] = useState<Phase>({ status: "boot" });
  const [loginOpen, setLoginOpen] = useState(false);

  useEffect(() => {
    let live = true;
    let unsubscribe: (() => void) | null = null;

    (async () => {
      try {
        const auth: Auth = await getFirebaseAuth();
        if (!live) return;
        unsubscribe = auth.onAuthStateChanged((u: User | null) => {
          if (!live) return;
          setPhase(u ? { status: "signedIn", user: toAuthUser(u) } : { status: "signedOut" });
        });
      } catch {
        // Firebase not configured → no login gate.
        if (live) setPhase({ status: "anon" });
      }
    })();

    return () => {
      live = false;
      unsubscribe?.();
    };
  }, []);

  const signIn = async (provider: "google" | "github") => {
    const { GoogleAuthProvider, GithubAuthProvider, signInWithPopup } = await import("firebase/auth");
    const auth = await getFirebaseAuth();
    const prov = provider === "google" ? new GoogleAuthProvider() : new GithubAuthProvider();
    await signInWithPopup(auth, prov);
    // onAuthStateChanged flips the phase.
  };

  /** Email/password sign-in. Returns a message when a verification email is sent. */
  const signInEmail = async (email: string, password: string): Promise<string | null> => {
    const { signInWithEmailAndPassword } = await import("firebase/auth");
    const auth = await getFirebaseAuth();
    await signInWithEmailAndPassword(auth, email.trim(), password);
    return null; // onAuthStateChanged flips the phase
  };

  /** Create a new account and (optionally) send the email verification link. */
  const signUpEmail = async (name: string, email: string, password: string): Promise<{ verify: boolean }> => {
    const { createUserWithEmailAndPassword, sendEmailVerification, updateProfile } = await import("firebase/auth");
    const auth = await getFirebaseAuth();
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
    const displayName = name.trim();
    if (displayName) {
      await updateProfile(cred.user, { displayName }).catch(() => undefined);
    }
    let verify = false;
    try {
      await sendEmailVerification(cred.user);
      verify = true;
    } catch {
      // Verification email is best-effort — the account still works.
    }
    return { verify };
  };

  /** Send a password-reset email (works even when signed out). */
  const resetPassword = async (email: string): Promise<void> => {
    const { sendPasswordResetEmail } = await import("firebase/auth");
    const auth = await getFirebaseAuth();
    await sendPasswordResetEmail(auth, email.trim());
  };

  /** Persist a custom display name / photo to the Firebase account. */
  const syncProfile = async (displayName: string, photoDataUrl: string | null) => {
    const { updateProfile } = await import("firebase/auth");
    const auth = await getFirebaseAuth();
    const current = auth.currentUser;
    if (!current) return;
    const patch: { displayName?: string; photoURL?: string | null } = {};
    if (displayName.trim()) patch.displayName = displayName.trim();
    if (photoDataUrl) patch.photoURL = photoDataUrl;
    await updateProfile(current, patch);
  };

  const signOut = async () => {
    const { signOut } = await import("firebase/auth");
    const auth = await getFirebaseAuth();
    await signOut(auth);
  };

  const signedIn = phase.status === "signedIn";
  const uid = signedIn ? phase.user.uid : null;

  return (
    <>
      {/* key=uid remounts ChatApp per account, so hydration always re-reads the
          right namespace when the auth state resolves after boot. */}
      <ChatApp
        key={uid ?? "anon"}
        authUid={uid}
        user={signedIn ? phase.user : null}
        onSignOut={phase.status === "anon" ? undefined : signOut}
        authAvailable={phase.status !== "anon"}
        onOpenLogin={phase.status === "anon" ? undefined : () => setLoginOpen(true)}
        onSyncProfile={phase.status === "anon" ? undefined : syncProfile}
      />

      {loginOpen ? (
        <LoginScreen
          variant="modal"
          onClose={() => setLoginOpen(false)}
          onSignedIn={() => setLoginOpen(false)}
          onSignIn={signIn}
          onSignInEmail={signInEmail}
          onSignUpEmail={signUpEmail}
          onResetPassword={resetPassword}
        />
      ) : null}
    </>
  );
}