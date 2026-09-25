import type { Auth } from "firebase/auth";

/**
 * Firebase Auth bootstrap.
 *
 * Reads the public web-app config from NEXT_PUBLIC_FIREBASE_* env vars.
 * If any piece is missing the app deliberately stays anonymous — the login
 * gate only activates once the config is present (see components/AuthGate.tsx).
 *
 * Auth is initialised lazily so the firebase bundles are only downloaded when
 * configuration exists.
 */

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
}

export function getFirebaseConfig(): FirebaseConfig | null {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim() ?? "";
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim() ?? "";
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() ?? "";
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID?.trim() ?? "";
  if (!apiKey || !authDomain || !projectId || !appId) return null;
  return { apiKey, authDomain, projectId, appId };
}

let authPromise: Promise<Auth> | null = null;

/** Resolve the Firebase Auth instance (rejects when Firebase isn't configured). */
export function getFirebaseAuth(): Promise<Auth> {
  if (!authPromise) {
    authPromise = (async () => {
      const cfg = getFirebaseConfig();
      if (!cfg) throw new Error("Firebase is not configured");
      const [{ initializeApp, getApps, getApp }, { getAuth }] = await Promise.all([
        import("firebase/app"),
        import("firebase/auth"),
      ]);
      const app = getApps().length ? getApp() : initializeApp(cfg);
      return getAuth(app);
    })();
  }
  return authPromise;
}