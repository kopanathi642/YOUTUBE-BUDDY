import { FormEvent, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { api, Me } from "../api";
import { useAuth } from "../App";
import { Brand } from "../components/Shell";

export default function AuthPage({ mode }: { mode: "signin" | "signup" }) {
  const { me, setMe } = useAuth();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const next = params.get("next")?.startsWith("/") ? params.get("next")! : "/home";
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

  return (
    <div className="auth-wrap">
      <form className="card auth-card" onSubmit={submit} noValidate>
        <Brand />
        <h1 style={{ fontSize: 22, margin: "22px 0 4px" }}>{mode === "signup" ? "Create your account" : "Welcome back"}</h1>
        <p className="muted" style={{ marginTop: 0 }}>{mode === "signup" ? "Your media is stored privately in the cloud. Only your workspace can see it." : "Sign in to continue editing."}</p>
        <div className="grid" style={{ gap: 14, marginTop: 18 }}>
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
