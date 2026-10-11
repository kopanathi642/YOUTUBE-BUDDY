import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  linkWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  OAuthCredential,
  UserCredential,
} from 'firebase/auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const AUTH_TOKEN_KEY = 'ytb_auth_token';
const AUTH_USER_KEY = 'ytb_auth_user';
const YT_TOKEN_KEY = 'ytb_youtube_token';
const YT_TOKEN_EXPIRY_KEY = 'ytb_youtube_token_expiry';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId &&
    firebaseConfig.appId
);

let authClient: ReturnType<typeof getAuth> | null = null;
let googleProvider: GoogleAuthProvider | null = null;
let youtubeProvider: GoogleAuthProvider | null = null;

if (typeof window !== 'undefined' && isFirebaseConfigured) {
  const apps = getApps();
  const app = apps.length ? apps[0] : initializeApp(firebaseConfig);
  authClient = getAuth(app);
  
  googleProvider = new GoogleAuthProvider();
  googleProvider.setCustomParameters({ prompt: 'select_account' });
  
  youtubeProvider = new GoogleAuthProvider();
  youtubeProvider.addScope('https://www.googleapis.com/auth/youtube.readonly');
}

export type LocalUser = {
  uid: string;
  email: string;
  displayName: string | null;
  photoURL: string | null;
  emailVerified: boolean;
  getIdToken: () => Promise<string>;
};

let currentUser: LocalUser | null = null;
const listeners = new Set<(user: LocalUser | null) => void>();

const auth = {
  get currentUser() {
    return currentUser;
  },
  set currentUser(user: LocalUser | null) {
    currentUser = user;
  },
};

const publishAuthChange = () => {
  listeners.forEach((callback) => callback(currentUser));
};

const saveUserState = (user: LocalUser, token: string) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  localStorage.setItem(
    AUTH_USER_KEY,
    JSON.stringify({
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      emailVerified: user.emailVerified,
    })
  );
};

const clearUserState = () => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
};

const loadStoredUser = () => {
  if (typeof window === 'undefined') return;

  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  const userData = localStorage.getItem(AUTH_USER_KEY);
  if (!token || !userData) return;

  try {
    const parsed = JSON.parse(userData) as Omit<LocalUser, 'getIdToken'>;
    currentUser = {
      ...parsed,
      getIdToken: async () => token,
    };
  } catch {
    clearUserState();
  }
};

if (typeof window !== 'undefined') {
  loadStoredUser();
}

const getAuthError = async (response: Response) => {
  const data = await response.json().catch(() => null);
  return data?.detail || data?.message || 'Authentication failed';
};

type FirebaseAuthError = {
  code?: string;
  message?: string;
  customData?: unknown;
};

export const signInWithGoogle = async () => {
  if (typeof window === 'undefined') {
    throw new Error('Google sign-in must be run in the browser');
  }

  if (!isFirebaseConfigured || !authClient || !googleProvider) {
    throw new Error('Firebase configuration is missing. Please check your .env.local file.');
  }

  let result: UserCredential;
  try {
    result = await signInWithPopup(authClient, googleProvider);
  } catch (error: unknown) {
    const firebaseError = error as FirebaseAuthError;
    const code = firebaseError.code || '';

    if (code === 'auth/popup-blocked') {
      throw new Error(
        'Google sign-in popup was blocked. Allow popups for localhost:3000 and try again.'
      );
    }
    if (code === 'auth/unauthorized-domain') {
      throw new Error(
        `Google sign-in is not enabled for ${window.location.hostname}. Add this domain in Firebase Console > Authentication > Settings > Authorized domains.`
      );
    }
    if (code === 'auth/operation-not-allowed') {
      throw new Error(
        'Google sign-in is disabled in Firebase. Enable the Google provider in Firebase Console > Authentication > Sign-in method.'
      );
    }
    if (code === 'auth/account-exists-with-different-credential') {
      throw new Error(
        'An account already exists with this email. Sign in with email first, then connect Google.'
      );
    }
    if (code === 'auth/popup-closed-by-user') {
      throw new Error('Google sign-in was cancelled.');
    }

    console.error('Google sign-in failed:', {
      code,
      message: firebaseError.message,
      authDomain: firebaseConfig.authDomain,
      projectId: firebaseConfig.projectId,
      hostname: window.location.hostname,
    });
    throw new Error(firebaseError.message || 'Google sign-in failed. Please try again.');
  }

  const firebaseUser = result.user;
  const idToken = await firebaseUser.getIdToken(true);

  try {
    const response = await fetch(`${API_URL}/api/v1/auth/firebase-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id_token: idToken }),
    });

    if (!response.ok) {
      throw new Error(
        `Google account was verified, but the backend rejected the login: ${await getAuthError(response)}`
      );
    }
    const data = await response.json();
    const token = data.access_token;
    if (!token) throw new Error('Backend login did not return an access token.');
    
    const user: LocalUser = {
      uid: firebaseUser.uid,
      email: firebaseUser.email ?? '',
      displayName: firebaseUser.displayName,
      photoURL: firebaseUser.photoURL,
      emailVerified: firebaseUser.emailVerified,
      getIdToken: async () => token,
    };

    auth.currentUser = user;
    saveUserState(user, token);
    publishAuthChange();
    return { user };
  } catch (err) {
    await firebaseSignOut(authClient).catch(() => undefined);
    throw new Error(err instanceof Error ? err.message : 'Backend login failed');
  }
};

// ── YouTube Connection ─────────────────────────────────────────────────────

/**
 * Store YouTube token with its expiry timestamp.
 * Google OAuth access tokens typically expire in 3600 seconds (1 hour).
 */
const saveYouTubeToken = (token: string) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(YT_TOKEN_KEY, token);
  // Google access tokens expire in ~1 hour; save expiry with 5-min buffer
  const expiresAt = Date.now() + 55 * 60 * 1000;
  localStorage.setItem(YT_TOKEN_EXPIRY_KEY, String(expiresAt));
};

/**
 * Check if a stored YouTube token exists and is still valid.
 */
export const isYouTubeTokenValid = (): boolean => {
  if (typeof window === 'undefined') return false;
  const token = localStorage.getItem(YT_TOKEN_KEY);
  const expiry = localStorage.getItem(YT_TOKEN_EXPIRY_KEY);
  if (!token || !expiry) return false;
  return Date.now() < Number(expiry);
};

/**
 * Get the stored YouTube token, or null if expired/missing.
 */
export const getYouTubeToken = (): string | null => {
  if (!isYouTubeTokenValid()) {
    // Clean up expired token
    if (typeof window !== 'undefined') {
      localStorage.removeItem(YT_TOKEN_KEY);
      localStorage.removeItem(YT_TOKEN_EXPIRY_KEY);
    }
    return null;
  }
  return localStorage.getItem(YT_TOKEN_KEY);
};

/**
 * Disconnect YouTube by removing stored tokens.
 */
export const disconnectYouTube = () => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(YT_TOKEN_KEY);
  localStorage.removeItem(YT_TOKEN_EXPIRY_KEY);
};

/**
 * Extract the OAuth access token from the popup result.
 */
const extractYouTubeToken = (credential: OAuthCredential | null): string | null => {
  return credential?.accessToken || null;
};

/**
 * Connect YouTube account to the currently signed-in user.
 *
 * Uses `linkWithPopup()` to add YouTube scopes to the existing auth session
 * without replacing the user. If linking fails (e.g., account already linked
 * to a different user), falls back to `signInWithPopup()` and re-stores
 * the main user's auth state.
 */
export const connectYouTubeAccount = async () => {
  if (typeof window === 'undefined') {
    throw new Error('YouTube connection must be run in the browser');
  }

  if (!isFirebaseConfigured || !authClient || !youtubeProvider) {
    throw new Error('Firebase configuration is missing. Please check your .env.local file.');
  }

  // Ensure user is signed in
  const firebaseUser = authClient.currentUser;
  if (!firebaseUser) {
    throw new Error('You must be signed in before connecting YouTube. Please sign in first.');
  }

  try {
    // Forces account selection so user can pick the right channel/brand account
    youtubeProvider.setCustomParameters({ prompt: 'select_account' });
    
    // Try linkWithPopup first — this adds YouTube scopes to the existing session
    // without changing the signed-in user identity
    try {
      const result = await linkWithPopup(firebaseUser, youtubeProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = extractYouTubeToken(credential);
      
      if (token) {
        saveYouTubeToken(token);
        console.log('YouTube connected via linkWithPopup — token stored.');
      } else {
        console.warn('YouTube linkWithPopup succeeded but no access token returned.');
      }
      
      return result;
    } catch (linkError: unknown) {
      const linkFirebaseError = linkError as FirebaseAuthError;
      
      // If the YouTube account is already linked to another Firebase user,
      // or the provider is already linked, fall back to signInWithPopup
      if (
        linkFirebaseError.code === 'auth/credential-already-in-use' ||
        linkFirebaseError.code === 'auth/provider-already-linked' ||
        linkFirebaseError.code === 'auth/email-already-in-use'
      ) {
        console.log('Link failed (already linked), falling back to signInWithPopup for token extraction.');
        
        // Use signInWithPopup just to get the YouTube access token
        const result = await signInWithPopup(authClient!, youtubeProvider!);
        const credential = GoogleAuthProvider.credentialFromResult(result);
        const token = extractYouTubeToken(credential);
        
        if (token) {
          saveYouTubeToken(token);
          console.log('YouTube connected via signInWithPopup fallback — token stored.');
        }

        // If signInWithPopup changed the user, re-sign-in with the original user is
        // not needed because our app manages its own token (not Firebase's onAuthStateChanged).
        // The local JWT in localStorage is still valid.
        
        return result;
      }
      
      // Re-throw other errors
      throw linkError;
    }
  } catch (error: unknown) {
    const firebaseError = error as FirebaseAuthError;
    if (firebaseError.code === 'auth/popup-closed-by-user') {
      throw new Error('YouTube connection was cancelled. Please try again and complete the authorization in the popup window.');
    }
    
    if (firebaseError.code === 'auth/popup-blocked') {
      throw new Error('Popup was blocked by your browser. Please allow popups for this site and try again.');
    }

    console.error('YouTube Connection Error:', {
      code: firebaseError.code,
      message: firebaseError.message,
      customData: firebaseError.customData
    });
    
    throw new Error('Failed to connect YouTube account. Please try again or contact support if the problem persists.');
  }
};

/**
 * Refresh the YouTube token by re-prompting the user.
 * Call this when the stored token is expired.
 */
export const refreshYouTubeToken = async (): Promise<string | null> => {
  if (isYouTubeTokenValid()) {
    return getYouTubeToken();
  }
  
  // Token is expired — need to re-authorize
  await connectYouTubeAccount();
  return getYouTubeToken();
};

// ── Email Auth ──────────────────────────────────────────────────────────────

export const signInWithEmail = async (email: string, password: string) => {
  const response = await fetch(`${API_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) throw new Error(await getAuthError(response));
  
  const data = await response.json();
  const token = data.access_token;
  const user: LocalUser = {
    uid: email,
    email,
    displayName: email.split('@')[0],
    photoURL: null,
    emailVerified: true,
    getIdToken: async () => token,
  };

  auth.currentUser = user;
  saveUserState(user, token);
  publishAuthChange();
  return { user };
};

export const signInWithDemo = async () => {
  const response = await fetch(`${API_URL}/api/v1/auth/dev-login`, {
    method: 'POST',
  });
  if (!response.ok) throw new Error(await getAuthError(response));

  const data = await response.json();
  const token = data.access_token;
  if (!token) throw new Error('Demo login did not return an access token.');

  const user: LocalUser = {
    uid: 'demo-user-123',
    email: 'demo@youtubebuddy.com',
    displayName: 'Demo Creator',
    photoURL: null,
    emailVerified: true,
    getIdToken: async () => token,
  };
  auth.currentUser = user;
  saveUserState(user, token);
  publishAuthChange();
  return { user };
};

export const signUpWithEmail = async (email: string, password: string, displayName?: string) => {
  const response = await fetch(`${API_URL}/api/v1/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, display_name: displayName }),
  });

  if (!response.ok) {
    throw new Error(await getAuthError(response));
  }
  
  const data = await response.json();
  const token = data.access_token;
  const user: LocalUser = {
    uid: email,
    email,
    displayName: displayName || email.split('@')[0],
    photoURL: null,
    emailVerified: true,
    getIdToken: async () => token,
  };

  auth.currentUser = user;
  saveUserState(user, token);
  publishAuthChange();
  return { user };
};

export const sendPasswordReset = async (email?: string) => {
  void email;
  return Promise.resolve();
};

export const logout = async () => {
  if (typeof window !== 'undefined' && authClient) {
    try {
      await firebaseSignOut(authClient);
    } catch {
      // Ignore errors on logout cleanup.
    }
  }

  auth.currentUser = null;
  clearUserState();
  disconnectYouTube();
  publishAuthChange();
};

export const onAuthChange = (callback: (user: LocalUser | null) => void) => {
  listeners.add(callback);
  callback(currentUser);
  return () => {
    listeners.delete(callback);
  };
};

export const isConfigured = isFirebaseConfigured;
export { auth };
