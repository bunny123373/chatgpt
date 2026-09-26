"use client";

import { useState } from "react";
import { useAuth } from "@/lib/useAuth";
import ChatApp from "./ChatApp";
import LoginScreen from "./LoginScreen";

/**
 * Authentication wrapper (no gate).
 *
 * All the state and the Firebase calls live in lib/useAuth, shared with the
 * landing page so both offer sign-in through exactly the same code path. This
 * file only decides what to render.
 *
 *  - The app ALWAYS renders; nobody is forced to log in.
 *  - Signed out  -> anonymous data (`chatgpt2.*`), "Log in" in the sidebar.
 *  - Signed in   -> per-account data (`chatgpt2.u.<uid>.*`), sign-out in the sidebar.
 *  - No Firebase config -> anonymous mode, the Log in button stays hidden.
 */
export default function AuthGate() {
  const { user, uid, authAvailable, actions } = useAuth();
  const [loginOpen, setLoginOpen] = useState(false);
  const anon = !authAvailable;

  return (
    <>
      {/* key=uid remounts ChatApp per account, so hydration always re-reads the
          right namespace when the auth state resolves after boot. */}
      <ChatApp
        key={uid ?? "anon"}
        authUid={uid}
        user={user}
        onSignOut={anon ? undefined : actions.signOut}
        authAvailable={authAvailable}
        onOpenLogin={anon ? undefined : () => setLoginOpen(true)}
        onSyncProfile={anon ? undefined : actions.syncProfile}
      />

      {loginOpen ? (
        <LoginScreen
          variant="modal"
          onClose={() => setLoginOpen(false)}
          onSignedIn={() => setLoginOpen(false)}
          onSignIn={actions.signIn}
          onSignInEmail={actions.signInEmail}
          onSignUpEmail={actions.signUpEmail}
          onResetPassword={actions.resetPassword}
        />
      ) : null}
    </>
  );
}
