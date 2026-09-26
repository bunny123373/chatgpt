"use client";

import { useCallback, useEffect, useState } from "react";
import type { Auth, User } from "firebase/auth";
import { getFirebaseAuth } from "./firebase";
import type { AuthUser } from "./types";

/**
 * Authentication state and actions.
 *
 * Extracted from components/AuthGate so the landing page can offer sign-in
 * without a second copy of the Firebase logic. Two copies of this would drift,
 * and the failure mode is nasty: a fix applied in the app but not on the landing
 * page means signing in behaves differently depending on where you started.
 *
 * There is no gate. Nobody is forced to log in, and the whole app works
 * anonymously:
 *
 *   - no Firebase config  -> "anon": no sign-in UI anywhere
 *   - signed out          -> anonymous data (`chatgpt2.*`)
 *   - signed in           -> per-account data (`chatgpt2.u.<uid>.*`)
 *
 * `phase` starts as "boot" so callers can avoid flashing a sign-in button that
 * disappears a moment later once the real state resolves.
 */

export type AuthPhase =
  | { status: "boot" }
  | { status: "anon" }
  | { status: "signedOut" }
  | { status: "signedIn"; user: AuthUser };

export interface AuthActions {
  signIn: (provider: "google" | "github") => Promise<void>;
  /** Returns a message when a verification email is sent, else null. */
  signInEmail: (email: string, password: string) => Promise<string | null>;
  signUpEmail: (name: string, email: string, password: string) => Promise<{ verify: boolean }>;
  resetPassword: (email: string) => Promise<void>;
  syncProfile: (displayName: string, photoDataUrl: string | null) => Promise<void>;
  signOut: () => Promise<void>;
}

function toAuthUser(u: User): AuthUser {
  return {
    uid: u.uid,
    name: u.displayName || u.email?.split("@")[0] || "User",
    email: u.email || "",
    image: u.photoURL || null,
  };
}

export function useAuth(): { phase: AuthPhase; user: AuthUser | null; uid: string | null; signedIn: boolean; authAvailable: boolean; actions: AuthActions } {
  const [phase, setPhase] = useState<AuthPhase>({ status: "boot" });

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
        // Firebase not configured: this site runs anonymously, so stay put.
        if (live) setPhase({ status: "anon" });
      }
    })();

    return () => {
      live = false;
      unsubscribe?.();
    };
  }, []);

  // firebase/auth is imported dynamically everywhere below so the auth bundle
  // is only downloaded when it is actually used, which on an unconfigured site
  // is never.
  const signIn = useCallback(async (provider: "google" | "github") => {
    const { GoogleAuthProvider, GithubAuthProvider, signInWithPopup } = await import("firebase/auth");
    const auth = await getFirebaseAuth();
    const prov = provider === "google" ? new GoogleAuthProvider() : new GithubAuthProvider();
    await signInWithPopup(auth, prov);
    // onAuthStateChanged flips the phase.
  }, []);

  const signInEmail = useCallback(async (email: string, password: string): Promise<string | null> => {
    const { signInWithEmailAndPassword } = await import("firebase/auth");
    const auth = await getFirebaseAuth();
    await signInWithEmailAndPassword(auth, email.trim(), password);
    return null; // onAuthStateChanged flips the phase
  }, []);

  const signUpEmail = useCallback(async (name: string, email: string, password: string): Promise<{ verify: boolean }> => {
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
      // Verification is best-effort: the account works without it.
    }
    return { verify };
  }, []);

  const resetPassword = useCallback(async (email: string): Promise<void> => {
    const { sendPasswordResetEmail } = await import("firebase/auth");
    const auth = await getFirebaseAuth();
    await sendPasswordResetEmail(auth, email.trim());
  }, []);

  const syncProfile = useCallback(async (displayName: string, photoDataUrl: string | null) => {
    const { updateProfile } = await import("firebase/auth");
    const auth = await getFirebaseAuth();
    const current = auth.currentUser;
    if (!current) return;
    const patch: { displayName?: string; photoURL?: string | null } = {};
    if (displayName.trim()) patch.displayName = displayName.trim();
    if (photoDataUrl) patch.photoURL = photoDataUrl;
    await updateProfile(current, patch);
  }, []);

  const signOut = useCallback(async () => {
    const { signOut } = await import("firebase/auth");
    const auth = await getFirebaseAuth();
    await signOut(auth);
  }, []);

  const signedIn = phase.status === "signedIn";

  return {
    phase,
    user: signedIn ? phase.user : null,
    uid: signedIn ? phase.user.uid : null,
    signedIn,
    // "boot" is not yet "anon", so a caller must not treat boot as available and
    // render a button that is about to disappear.
    authAvailable: phase.status === "signedIn" || phase.status === "signedOut",
    actions: { signIn, signInEmail, signUpEmail, resetPassword, syncProfile, signOut },
  };
}
