import Legal from "./pages/Legal";
import { createContext, lazy, ReactNode, Suspense, useCallback, useContext, useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { api, ApiError, Me, Workspace } from "./api";
import Landing from "./pages/Landing";
import AuthPage from "./pages/Auth";
import { universeById } from "./universes";

// Signed-in pages load on demand, so the public pages (landing, sign-in, legal) stay small and fast for visitors and Google.
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Projects = lazy(() => import("./pages/Projects"));
const Editor = lazy(() => import("./editor/Editor"));
const Shell = lazy(() => import("./components/Shell"));
const Gateway = lazy(() => import("./pages/Gateway"));
const AiHub = lazy(() => import("./pages/AiHub").then((m) => ({ default: m.AiHub })));
const AiStudio = lazy(() => import("./pages/AiHub").then((m) => ({ default: m.AiStudio })));
const AiExplorer = lazy(() => import("./pages/AiHub").then((m) => ({ default: m.AiExplorer })));
const AiTool = lazy(() => import("./pages/AiTool"));
const Super = lazy(() => import("./pages/Super"));
const SuperLocked = lazy(() => import("./pages/Super").then((m) => ({ default: m.SuperLocked })));
const Library = lazy(() => import("./pages/Library"));
const Channel = lazy(() => import("./pages/Channel"));
const Growth = lazy(() => import("./pages/Growth"));
const Settings = lazy(() => import("./pages/Settings"));

const Loading = () => <div className="auth-wrap"><div className="spinner" aria-label="Loading" /></div>;

/** Tab title per page (the server sets the same title, description and robots rules in the HTML for crawlers). */
const TITLES: [RegExp, string][] = [
  [/^\/$/, "Video editor & AI studio for creators"], [/^\/signin/, "Sign in"], [/^\/signup/, "Create your free account"],
  [/^\/privacy/, "Privacy"], [/^\/terms/, "Terms"], [/^\/universes/, "Universes"], [/^\/editor\/projects/, "Projects"],
  [/^\/editor/, "Editor"], [/^\/edit\//, "Editing"], [/^\/ai-generator/, "AI Generator"], [/^\/super/, "Super Universe"],
  [/^\/library/, "Library"], [/^\/growth/, "Growth"], [/^\/channel/, "My channel"], [/^\/settings/, "Settings"],
];
function RouteTitle() {
  const { pathname } = useLocation();
  const brand = useBrand();
  useEffect(() => {
    const t = TITLES.find(([re]) => re.test(pathname))?.[1] ?? "Page not found";
    document.title = pathname === "/" ? `${brand} — ${t}` : `${t} · ${brand}`;
  }, [pathname, brand]);
  return null;
}

const BrandCtx = createContext("Creator Universe");
export const useBrand = () => useContext(BrandCtx);

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
  const [brand, setBrand] = useState("Creator Universe");
  useEffect(() => { api<{ brand?: string }>("/auth/config").then((c) => c.brand && setBrand(c.brand)).catch(() => {}); }, []);

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
    <BrandCtx.Provider value={brand}><Ctx.Provider value={{ me, loading, workspace, setWorkspace, refresh, setMe }}>
      <ToastCtx.Provider value={toast}>
        {children}
        <div className="toast-wrap" role="status" aria-live="polite">{toasts.map((t) => <div key={t.id} className="toast">{t.text}</div>)}</div>
      </ToastCtx.Provider>
    </Ctx.Provider></BrandCtx.Provider>
  );
}

function Private({ children, bare }: { children: ReactNode; bare?: boolean }) {
  const { me, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Loading />;
  if (!me) return <Navigate to={`/signin?next=${encodeURIComponent(loc.pathname)}`} replace />;
  return bare ? <>{children}</> : <Shell>{children}</Shell>;
}

function LegacyAi() {
  const loc = useLocation();
  return <Navigate to={loc.pathname.replace(/^\/ai-creation/, "/ai-generator") + loc.search} replace />;
}

function LegacyProjects() {
  const loc = useLocation();
  return <Navigate to={`/editor/projects${loc.search}`} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Providers>
        <RouteTitle />
        <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/signin" element={<AuthPage mode="signin" />} />
          <Route path="/signup" element={<AuthPage mode="signup" />} />
          <Route path="/universes" element={<Private bare><Gateway /></Private>} />
          <Route path="/editor" element={<Private><Dashboard /></Private>} />
          <Route path="/editor/projects" element={<Private><Projects /></Private>} />
          <Route path="/ai-generator" element={<Private bare><AiHub /></Private>} />
          <Route path="/ai-generator/studio/:sid" element={<Private bare><AiStudio /></Private>} />
          <Route path="/ai-generator/explore" element={<Private bare><AiExplorer /></Private>} />
          <Route path="/ai-generator/tool/:id" element={<Private bare><AiTool /></Private>} />
          <Route path="/super" element={<Private bare>{universeById("super").locked ? <SuperLocked /> : <Super />}</Private>} />
          <Route path="/library" element={<Private bare><Library /></Private>} />
          <Route path="/channel" element={<Private bare><Channel /></Private>} />
          <Route path="/growth" element={<Private bare><Growth /></Private>} />
          <Route path="/settings" element={<Private bare><Settings /></Private>} />
          <Route path="/privacy" element={<Legal kind="privacy" />} />
          <Route path="/terms" element={<Legal kind="terms" />} />
          <Route path="/home" element={<Navigate to="/editor" replace />} />
          <Route path="/ai-creation/*" element={<LegacyAi />} />
          <Route path="/projects" element={<LegacyProjects />} />
          <Route path="/edit/:projectId" element={<Private bare><Editor /></Private>} />
          <Route path="*" element={<div className="auth-wrap"><div className="card auth-card"><h2>Page not found</h2><a className="btn" href="/universes">Go to universes</a></div></div>} />
        </Routes>
        </Suspense>
      </Providers>
    </BrowserRouter>
  );
}
