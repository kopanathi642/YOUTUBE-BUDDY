// Google sign-in through Firebase Authentication. The Firebase SDK is loaded on demand only.
// After Google confirms the user, we send the ID token to our backend, which verifies it and
// starts our own session. We then sign out of the Firebase client so there is one session only.
import { api, Me } from "./api";

export type AuthConfig = { password: boolean; google: boolean; firebase: { apiKey: string; authDomain: string; projectId: string; appId: string | null } | null };

export async function signInWithGoogle(cfg: NonNullable<AuthConfig["firebase"]>): Promise<Me> {
  const [{ initializeApp, getApps }, { getAuth, GoogleAuthProvider, signInWithPopup, signOut }] =
    await Promise.all([import("firebase/app"), import("firebase/auth")]);
  const app = getApps()[0] ?? initializeApp({ apiKey: cfg.apiKey, authDomain: cfg.authDomain, projectId: cfg.projectId, ...(cfg.appId ? { appId: cfg.appId } : {}) });
  const auth = getAuth(app);
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  // Basic profile + email only. YouTube scopes will be requested later, only when a YouTube feature is switched on.
  const cred = await signInWithPopup(auth, provider);
  try {
    const idToken = await cred.user.getIdToken();
    return await api<Me>("/auth/google", { method: "POST", body: { id_token: idToken } });
  } finally {
    await signOut(auth).catch(() => {});
  }
}

export function googleErrorMessage(e: unknown): string {
  const code = (e as { code?: string })?.code ?? "";
  if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return "";
  if (code === "auth/popup-blocked") return "Your browser blocked the Google window. Allow pop-ups for this site and try again.";
  if (code === "auth/unauthorized-domain") return "This website address isn't authorised in Firebase yet (Authentication → Settings → Authorized domains).";
  if (code === "auth/invalid-api-key" || code === "auth/api-key-not-valid.-please-pass-a-valid-api-key.") return "Google sign-in is misconfigured (Firebase API key).";
  if (code === "auth/operation-not-allowed") return "Google sign-in is not enabled in Firebase (Authentication → Sign-in method).";
  return (e as Error)?.message || "Google sign-in failed";
}
