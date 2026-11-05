import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { api, ApiError, Me, Workspace } from "./api";
import Landing from "./pages/Landing";
import AuthPage from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Projects from "./pages/Projects";
import Editor from "./editor/Editor";
import Shell from "./components/Shell";

type AuthCtx = {
  me: Me | null; loading: boolean; workspace: Workspace | null;
  setWorkspace: (id: string) => void; refresh: () => Promise<void>; setMe: (m: Me | null) => void;
};
const Ctx = createContext<AuthCtx>(null!);
export const useAuth = () => useContext(Ctx);

type Toast = { id: number; text: string };
const ToastCtx = createContext<(t: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

function Providers({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [wsId, setWsId] = useState<string | null>(() => { try { return localStorage.getItem("cu.ws"); } catch { return null; } });
  const [toasts, setToasts] = useState<Toast[]>([]);

  const refresh = useCallback(async () => {
    try { setMe(await api<Me>("/auth/me")); }
    catch (e) { if (!(e instanceof ApiError && e.status === 401)) console.error(e); setMe(null); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const workspace = me ? me.workspaces.find((w) => w.id === wsId) ?? me.workspaces[0] ?? null : null;
  const setWorkspace = (id: string) => { setWsId(id); try { localStorage.setItem("cu.ws", id); } catch { /* private mode */ } };
  const toast = useCallback((text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  return (
    <Ctx.Provider value={{ me, loading, workspace, setWorkspace, refresh, setMe }}>
      <ToastCtx.Provider value={toast}>
        {children}
        <div className="toast-wrap" role="status" aria-live="polite">{toasts.map((t) => <div key={t.id} className="toast">{t.text}</div>)}</div>
      </ToastCtx.Provider>
    </Ctx.Provider>
  );
}

function Private({ children, bare }: { children: ReactNode; bare?: boolean }) {
  const { me, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="auth-wrap"><div className="spinner" aria-label="Loading" /></div>;
  if (!me) return <Navigate to={`/signin?next=${encodeURIComponent(loc.pathname)}`} replace />;
  return bare ? <>{children}</> : <Shell>{children}</Shell>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Providers>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/signin" element={<AuthPage mode="signin" />} />
          <Route path="/signup" element={<AuthPage mode="signup" />} />
          <Route path="/home" element={<Private><Dashboard /></Private>} />
          <Route path="/projects" element={<Private><Projects /></Private>} />
          <Route path="/edit/:projectId" element={<Private bare><Editor /></Private>} />
          <Route path="*" element={<div className="auth-wrap"><div className="card auth-card"><h2>Page not found</h2><a className="btn" href="/home">Go home</a></div></div>} />
        </Routes>
      </Providers>
    </BrowserRouter>
  );
}
