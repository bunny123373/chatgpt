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
 * Real authentication gate:
 *  - No Firebase config  → anonymous mode (works exactly as before).
 *  - Firebase configured → blocks the app behind the login screen until the
 *    user signs in with Google or GitHub; each account gets its own data.
 */
export default function AuthGate() {
  const [phase, setPhase] = useState<Phase>({ status: "boot" });

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

  const signOut = async () => {
    const { signOut } = await import("firebase/auth");
    const auth = await getFirebaseAuth();
    await signOut(auth);
  };

  if (phase.status === "boot") {
    return (
      <div className="auth-splash">
        <div className="auth-spinner" role="status" aria-label="Loading" />
      </div>
    );
  }

  if (phase.status === "signedOut") {
    return <LoginScreen onSignIn={signIn} />;
  }

  return (
    <ChatApp
      authUid={phase.status === "signedIn" ? phase.user.uid : null}
      user={phase.status === "signedIn" ? phase.user : null}
      onSignOut={signOut}
    />
  );
}