import { CSSProperties, useCallback, useEffect, useState } from "react";
import { Link, NavLink, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Lock, Play, Square, Clapperboard, RefreshCcw, Shuffle, Star, FolderOpen, Library, KeyRound, Sparkles } from "lucide-react";
import { api } from "../api";
import { useAuth, useToast } from "../App";
import GlobalBar from "../components/GlobalBar";
import { defaults, ENGINE_LABEL, estimate, fmtUsd, Generation, missing, Tool, useCatalogue, useGeneration, useProjectMedia, useProjects } from "../ai/core";
import { Ctx } from "../ai/controls";
import { LAYOUTS, STUDIO_META } from "../ai/studios";
import "../ai/ai.css";

const VKEY = (id: string) => `cu.ai.v.${id}`;

export default function AiTool() {
  const { id = "001" } = useParams();
  const { cat, err } = useCatalogue();
  const t = cat?.tools.find((x) => x.id === id || x.slug === id);
  if (err) return <Frame><div className="error-box" style={{ margin: 24 }}>{err}</div></Frame>;
  if (cat && !t) return <Frame><div className="empty" style={{ margin: 40 }}>This tool isn't available yet. <Link to="/ai-generator" style={{ color: "#c4b5fd" }}>See the tools you can use now</Link></div></Frame>;
  if (!cat || !t) return <Frame><div className="ws-loading"><span className="spinner" /></div></Frame>;
  return <Workspace key={t.id} t={t} tools={cat.tools} studios={cat.studios} />;
}

function Frame({ children, studio }: { children: React.ReactNode; studio?: string }) {
  const { cat } = useCatalogue();
  const m = STUDIO_META[studio ?? "video"];
  return (
    <div className="aiw" style={{ "--s1": m.c1, "--s2": m.c2 } as CSSProperties} data-motif={m.motif}>
      <GlobalBar sub="AI GENERATOR UNIVERSE" />
      <div className="aiw-body">
        <nav className="aiw-rail" aria-label="Studios">
          <Link to="/ai-generator" className="rail-home" title="AI Generator home"><Sparkles size={18} /></Link>
          {cat?.studios.map((s) => { const M = STUDIO_META[s.id]; const I = M.icon; return (
            <NavLink key={s.id} to={`/ai-generator/studio/${s.id}`} className={`rail-btn ${s.id === studio ? "on" : ""}`} title={s.name} style={{ "--r1": M.c1, "--r2": M.c2 } as CSSProperties}>
              <I size={18} /><span>{s.code}</span></NavLink>); })}
          <NavLink to="/library" className="rail-btn" title="Asset library"><Library size={18} /></NavLink>
        </nav>
        <main className="aiw-main">{children}</main>
      </div>
    </div>
  );
}

function Workspace({ t, tools, studios }: { t: Tool; tools: Tool[]; studios: any[] }) {
  const { workspace } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const { projects, pid, setPid } = useProjects(workspace?.id);
  const { media, reload: reloadMedia } = useProjectMedia(pid);
  const [v, setV] = useState<Record<string, any>>(() => {
    try { const s = sessionStorage.getItem(VKEY(t.id)); if (s) return { ...defaults(t), ...JSON.parse(s) }; } catch { /* storage off */ }
    return defaults(t);
  });
  const [model, setModel] = useState<string | undefined>(t.engine === "local" ? undefined : t.models[0]?.id);
  const [history, setHistory] = useState<Generation[]>([]);
  const [cur, setCur] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [g] = useGeneration(cur, () => { loadHistory(); reloadMedia(); });

  useEffect(() => { try { const { mask, ...rest } = v; sessionStorage.setItem(VKEY(t.id), JSON.stringify(rest)); void mask; } catch { /* storage off */ } }, [v, t.id]);
  useEffect(() => {  // opened from the Editor with ?project=…&media=… : pick that project and drop the clip into the first media input
    const q = new URLSearchParams(window.location.search), proj = q.get("project"), m = q.get("media");
    if (proj) setPid(proj);
    const slot = t.params.find((p) => p.type === "media");
    if (m && slot) setV((s) => ({ ...s, [slot.key]: m }));
  }, [t.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {  // a workflow sent from Templates or the Director Agent
    if (!["111", "118"].includes(t.id)) return;
    try { const s = sessionStorage.getItem("cu.wf.load"); if (s) { sessionStorage.removeItem("cu.wf.load"); setV((x) => ({ ...x, graph: JSON.parse(s) })); } } catch { /* storage off */ }
  }, [t.id]);
  useEffect(() => {
    if (t.id !== "005") return;
    try { const s = sessionStorage.getItem("cu.film.load"); if (s) { sessionStorage.removeItem("cu.film.load"); setV((x) => ({ ...x, shots: JSON.parse(s) })); } } catch { /* storage off */ }
  }, [t.id]);

  const loadHistory = useCallback(async () => {
    if (!pid) return setHistory([]);
    const h = await api<Generation[]>(`/projects/${pid}/generations?tool_id=${t.id}&limit=30`);
    setHistory(h);
    setCur((c) => c ?? h[0]?.id ?? null);
  }, [pid, t.id]);
  useEffect(() => { setCur(null); loadHistory().catch(() => {}); }, [loadHistory]);
  useEffect(() => {  // keep the queue fresh while something is running
    if (!history.some((h) => ["queued", "running"].includes(h.status))) return;
    const x = setTimeout(() => loadHistory().catch(() => {}), 2000);
    return () => clearTimeout(x);
  }, [history, loadHistory]);

  // default the main media input to the newest suitable file
  useEffect(() => {
    for (const p of t.params) if (p.type === "media" && p.required) {
      const m = media.find((x) => x.status === "ready" && (!p.accept?.length || p.accept.includes(x.kind)));
      // only fill an empty slot — never replace what the user picked (or is uploading)
      if (m) setV((x) => (x[p.key] && media.some((y) => y.id === x[p.key]) ? x : x[p.key] ? x : { ...x, [p.key]: m.id }));
    }
  }, [media]); // eslint-disable-line react-hooks/exhaustive-deps

  const c: Ctx = { v, set: (k, x) => setV((s) => ({ ...s, [k]: x })), media, pid, reloadMedia, tool: t, catalogueTools: tools };
  const pending = t.params.filter((p) => p.type === "media" || p.type === "media_multi").flatMap((p) => (Array.isArray(v[p.key]) ? v[p.key] : v[p.key] ? [v[p.key]] : []))
    .map((id: string) => media.find((m) => m.id === id)).find((m) => m && m.status !== "ready");
  const miss = missing(t, v) ?? (pending ? `“${pending.filename}” to finish processing` : null);
  const cost = estimate(t, model, v);
  const run = async (opts: { parent?: string; seedBump?: boolean } = {}) => {
    if (!pid) return toast("Create a project first");
    setBusy(true);
    try {
      let params = { ...v };
      if (opts.seedBump) params = { ...params, seed: String(Math.floor(Math.random() * 2 ** 31)) };
      const r = await api<Generation>(`/projects/${pid}/ai/tools/${t.id}/run`, { method: "POST", body: { params, model, parent_id: opts.parent ?? null } });
      setCur(r.id);
      setHistory((h) => [r, ...h]);
    } catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };
  const cancel = async () => { if (g?.job) { await api(`/jobs/${g.job.id}/cancel`, { method: "POST" }).catch(() => {}); loadHistory(); } };
  const toTimeline = async () => {
    if (!g) return;
    try { const r = await api<{ project_id: string; sequence_id: string }>(`/generations/${g.id}/timeline`, { method: "POST", body: {} }); nav(`/edit/${r.project_id}?seq=${r.sequence_id}`); }
    catch (e) { toast((e as Error).message); }
  };
  const restore = (h: Generation) => { setV({ ...defaults(t), ...h.params }); if (h.model && t.models.some((m) => m.id === h.model)) setModel(h.model); };
  const onUse = (k: string, val: any) => {
    if (k === "_to_film") { try { sessionStorage.setItem("cu.film.load", JSON.stringify(val.map((s: any) => ({ prompt: s.prompt, camera_move: s.camera_move, duration: Math.min(10, Math.max(5, s.duration)) })).slice(0, 8))); } catch { /* */ } nav("/ai-generator/tool/005"); return; }
    if (k === "_to_workflow") { try { sessionStorage.setItem("cu.wf.load", JSON.stringify(val)); } catch { /* */ } nav("/ai-generator/tool/111"); return; }
    if (k === "prompt") { try { sessionStorage.setItem(VKEY("001"), JSON.stringify({ ...defaults(tools.find((x) => x.id === "001")!), prompt: val })); } catch { /* */ } nav("/ai-generator/tool/001"); }
  };
  const running = !!g && ["queued", "running"].includes(g.status);
  const busyRun = busy || running;

  const runBar = (
    <div className="runbar">
      {t.status.state !== "ready" ? <div className="locked"><Lock size={15} /><div><b>{t.status.state === "unbuilt" ? "Not built yet" : "Needs setup"}</b>
        <small>{t.status.state === "unbuilt" ? t.status.detail : `The server needs ${t.status.needs.join(" and ")}. Add it in your host's secret settings — never paste keys into chat.`}</small></div></div>
        : <>
          {cost != null && <div className="cost" title="Provider list price for this run; billed by the provider">≈ {fmtUsd(cost)}<small>model cost</small></div>}
          {running ? <button type="button" className="btn runbtn stop" onClick={cancel}><Square size={15} />Stop</button>
            : <button type="button" className="btn runbtn" disabled={!!miss || busyRun || !pid || (t.consent && !v._consent)} onClick={() => run()} title={miss ? `Add ${miss}` : undefined}>
              {busy ? <span className="spinner" /> : <Play size={16} />}{RUN_LABEL[t.studio] ?? "Run"}</button>}
          {miss && <small className="dim">{pending && miss.includes("processing") ? "Waiting for" : "Add"} {miss}</small>}
        </>}
    </div>
  );
  const actions = g && g.status === "succeeded" ? (
    <div className="gen-actions">
      {t.timeline && (g.outputs.length > 0 || g.result?.sequence_ids?.length) && <button type="button" className="btn primary edit-tl" onClick={toTimeline}><Clapperboard size={15} />Edit in Timeline</button>}
      {t.status.state === "ready" && <button type="button" className="btn sm" onClick={() => run({ parent: g.id })} disabled={busyRun} title="Run again as a new version"><RefreshCcw size={13} />Regenerate</button>}
      {t.status.state === "ready" && t.params.some((p) => p.key === "seed") && <button type="button" className="btn sm" onClick={() => run({ parent: g.id, seedBump: true })} disabled={busyRun}><Shuffle size={13} />Variation</button>}
      <button type="button" className="btn sm ghost" onClick={() => restore(g)} title="Load this version's settings">Use settings</button>
      {g.outputs.length > 0 && <Link className="btn sm ghost" to="/library"><Library size={13} />In library</Link>}
      <span className="stars" role="group" aria-label="Rate this result">{[1, 2, 3, 4, 5].map((n) => <button type="button" key={n} className={(g.rating ?? 0) >= n ? "on" : ""} aria-label={`${n} stars`}
        onClick={() => api(`/generations/${g.id}/rate`, { method: "POST", body: { rating: n } }).then(loadHistory)}><Star size={13} /></button>)}</span>
      {g.model && <span className="dim small model-tag">{g.model}{g.est_cost_usd != null ? ` · ≈${fmtUsd(g.est_cost_usd)}` : ""}</span>}
    </div>
  ) : g && g.status === "awaiting_approval" ? (
    <div className="gen-actions"><button type="button" className="btn primary" onClick={() => api(`/generations/${g.id}/approve`, { method: "POST", body: { node_id: g.result.state.waiting } }).then(() => { setCur(null); setTimeout(() => setCur(g.id), 50); loadHistory(); })}>Approve and continue</button></div>
  ) : null;

  const Layout = LAYOUTS[t.studio];
  const studio = studios.find((s) => s.id === t.studio);
  const m = STUDIO_META[t.studio];
  const SI = m.icon;
  return (
    <Frame studio={t.studio}>
      <header className="ws-head">
        <Link to={`/ai-generator/studio/${t.studio}`} className="btn icon ghost" aria-label="Back to studio"><ArrowLeft size={16} /></Link>
        <span className="ws-studio"><SI size={15} />{studio?.name}</span>
        <h1><span className="ws-id">{t.id}</span>{t.name}</h1>
        <span className={`ws-state ${t.status.state}`}>{t.status.state === "ready" ? "Ready" : t.status.state === "needs_key" ? <><KeyRound size={12} />Needs key</> : "Not built yet"}</span>
        <span className="dim small ws-engine" title={t.status.detail}>{ENGINE_LABEL[t.engine]}</span>
        <div className="grow" />
        {t.models.length > 0 && t.engine !== "local" && <select className="input sm model-pick" value={model} onChange={(e) => setModel(e.target.value)} aria-label="Model">
          {t.models.map((x) => <option key={x.id} value={x.id}>{x.label}{x.usd_per_s ? ` · $${x.usd_per_s}/s` : x.usd_per_run ? ` · $${x.usd_per_run}/image` : ""}{x.tier ? ` · ${x.tier}` : ""}</option>)}</select>}
        {t.engine === "local" && t.models.length > 0 && <span className="dim small" title={t.status.detail}>{t.id === "041" ? "Premium voices with a fal.ai key" : "Prompt-based replace with a fal.ai key"}</span>}
        <label className="proj-pick"><FolderOpen size={14} /><select className="input sm" value={pid} onChange={(e) => setPid(e.target.value)} aria-label="Project">
          {projects?.length === 0 && <option value="">No projects yet</option>}{projects?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      </header>
      {projects?.length === 0 && <div className="info-box" style={{ margin: "0 18px 10px" }}>Outputs are saved into a project. <Link to="/editor/projects">Create a project</Link> first.</div>}
      {t.notice && <div className="info-box" style={{ margin: "0 18px 10px" }}>{t.notice}</div>}
      <Layout t={t} c={c} g={g} history={history} select={setCur} runBar={runBar} actions={actions} onUse={onUse} tools={tools} studios={studios}
        input={media.find((x) => x.id === (v.video || v.image || v.audio))} />
    </Frame>
  );
}

const RUN_LABEL: Record<string, string> = { video: "Roll camera", image: "Generate", transform: "Transform", animation: "Animate", audio: "Create audio", writing: "Write",
  content: "Analyse", creator: "Research", imageedit: "Apply", videointel: "Build", localize: "Localize", automation: "Run workflow" };

export { Frame };
