import { FormEvent, useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { api, Me } from "../api";
import { useAuth } from "../App";
import { Brand } from "../components/Shell";
import { AuthConfig, googleErrorMessage, signInWithGoogle } from "../google";

/** Only same-site paths: blocks open redirects like "//evil.com", "/\\evil.com" or "javascript:" after sign-in. */
export function safeNext(raw: string | null, origin: string = window.location.origin): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\") || /[\u0000-\u001f]/.test(raw)) return "/universes";
  try { const u = new URL(raw, origin); if (u.origin !== origin) return "/universes"; return u.pathname + u.search + u.hash; }
  catch { return "/universes"; }
}

export default function AuthPage({ mode }: { mode: "signin" | "signup" }) {
  const { me, setMe } = useAuth();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [cfg, setCfg] = useState<AuthConfig | null>(null);
  useEffect(() => { api<AuthConfig>("/auth/config").then(setCfg).catch(() => {}); }, []);
  const next = safeNext(params.get("next"));
  if (me) return <Navigate to={next} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const body = mode === "signup" ? { email, password, display_name: name } : { email, password };
      const m = await api<Me>(`/auth/${mode === "signup" ? "signup" : "login"}`, { method: "POST", body });
      setMe(m);
      nav(next, { replace: true });
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  async function google() {
    if (!cfg?.firebase) return;
    setBusy(true); setErr(null);
    try { setMe(await signInWithGoogle(cfg.firebase)); nav(next, { replace: true }); }
    catch (e) { const m = googleErrorMessage(e); if (m) setErr(m); }
    finally { setBusy(false); }
  }

  return (
    <div className="auth-wrap">
      <form className="card auth-card" onSubmit={submit} noValidate>
        <Brand />
        <h1 style={{ fontSize: 22, margin: "22px 0 4px" }}>{mode === "signup" ? "Create your account" : "Welcome back"}</h1>
        <p className="muted" style={{ marginTop: 0 }}>{mode === "signup" ? "Your media is stored privately in the cloud. Only your workspace can see it." : "Sign in to continue editing."}</p>
        {cfg?.google && <>
          <button type="button" className="btn lg google-btn" onClick={google} disabled={busy} style={{ width: "100%", marginTop: 18 }}>
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
            Continue with Google
          </button>
          <div className="or"><span>or use email</span></div>
        </>}
        <div className="grid" style={{ gap: 14, marginTop: cfg?.google ? 0 : 18 }}>
          {mode === "signup" && <div><label className="label" htmlFor="n">Your name</label><input id="n" className="input" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" /></div>}
          <div><label className="label" htmlFor="e">Email</label><input id="e" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></div>
          <div><label className="label" htmlFor="p">Password</label><input id="p" className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={10}
            autoComplete={mode === "signup" ? "new-password" : "current-password"} />
            {mode === "signup" && <div className="dim" style={{ fontSize: 12, marginTop: 6 }}>At least 10 characters.</div>}</div>
          {err && <div className="error-box" role="alert">{err}</div>}
          <button className="btn primary lg" disabled={busy}>{busy ? <span className="spinner" /> : mode === "signup" ? "Create account" : "Sign in"}</button>
          <div className="muted" style={{ textAlign: "center", fontSize: 13 }}>
            {mode === "signup" ? <>Already have an account? <Link to="/signin" style={{ color: "#c4b5fd" }}>Sign in</Link></> : <>New here? <Link to="/signup" style={{ color: "#c4b5fd" }}>Create an account</Link></>}
          </div>
        </div>
      </form>
    </div>
  );
}
