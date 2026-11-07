import { ReactNode, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, Bell, Gauge, Cpu, Settings, LayoutGrid, FolderOpen, CheckCircle2, XCircle } from "lucide-react";
import { api, fmtBytes, Job, Project, timeAgo } from "../api";
import { useAuth } from "../App";
import { Brand, UserMenu } from "./Shell";

type Cap = { id: string; label: string; ready: boolean; needs: string };
type Summary = { projects: number; media_count: number; storage_bytes: number; active_jobs: number; limits: { max_upload_bytes: number; max_concurrent_exports: number } };
const KIND: Record<string, string> = { "media.process": "Media processing", "render.export": "Export render", "media.derive": "Stabilize / background", "ai.tts": "AI voice", "ai.transcribe": "Transcription", "ai.translate": "Translation", "ai.dub": "Dubbing" };
export const jobLabel = (k: string) => KIND[k] ?? k;

function Pop({ icon, label, badge, children, wide }: { icon: ReactNode; label: string; badge?: number; children: ReactNode; wide?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", h); document.addEventListener("keydown", k);
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("keydown", k); };
  }, []);
  return (
    <div ref={ref} className="gb-pop">
      <button className="btn ghost gb-btn" aria-haspopup="dialog" aria-expanded={open} aria-label={label} title={label} onClick={() => setOpen(!open)}>
        {icon}<span className="gb-lbl">{label}</span>{!!badge && <span className="gb-badge">{badge}</span>}
      </button>
      {open && <div className={`card gb-panel ${wide ? "wide" : ""}`} role="dialog" aria-label={label}>{children}</div>}
    </div>
  );
}

export default function GlobalBar({ sub, right }: { sub?: string; right?: ReactNode }) {
  const { workspace } = useAuth();
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Project[] | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [sum, setSum] = useState<Summary | null>(null);
  const [caps, setCaps] = useState<Cap[]>([]);
  const [seen, setSeen] = useState(() => { try { return localStorage.getItem("cu.seenJobs") ?? ""; } catch { return ""; } });

  useEffect(() => {
    if (!workspace) return;
    const load = () => {
      api<Job[]>(`/workspaces/${workspace.id}/jobs`).then(setJobs).catch(() => {});
      api<Summary>(`/workspaces/${workspace.id}/summary`).then(setSum).catch(() => {});
    };
    load(); api<Cap[]>("/ai/capabilities").then(setCaps).catch(() => {});
    const t = setInterval(load, 6000);
    return () => clearInterval(t);
  }, [workspace]);
  useEffect(() => {
    if (!workspace || !q.trim()) { setHits(null); return; }
    const t = setTimeout(() => api<Project[]>(`/workspaces/${workspace.id}/projects?q=${encodeURIComponent(q.trim())}`).then(setHits).catch(() => setHits([])), 220);
    return () => clearTimeout(t);
  }, [q, workspace]);

  const finished = jobs.filter((j) => j.status === "succeeded" || j.status === "failed");
  const unseen = finished.filter((j) => (j.finished_at ?? "") > seen).length;
  const ready = caps.filter((c) => c.ready).length;

  return (
    <header className="gbar">
      <Brand sub={sub} />
      <div className="gb-search">
        <Search size={15} className="dim" />
        <input placeholder="Search projects…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Global project search"
          onKeyDown={(e) => { if (e.key === "Enter" && hits?.[0]) nav(`/edit/${hits[0].id}`); if (e.key === "Escape") setQ(""); }} />
        {hits && <div className="card gb-results" role="listbox">
          {hits.length === 0 && <div className="dim" style={{ padding: 10, fontSize: 13 }}>No projects match “{q}”.</div>}
          {hits.slice(0, 8).map((p) => <Link key={p.id} to={`/edit/${p.id}`} className="gb-hit" role="option" aria-selected={false} onClick={() => setQ("")}><FolderOpen size={14} />{p.name}<span className="dim">{timeAgo(p.updated_at)}</span></Link>)}
        </div>}
      </div>
      <div className="grow" />
      {right}
      <Link to="/universes" className="btn ghost gb-btn" title="All universes"><LayoutGrid size={17} /><span className="gb-lbl">Universes</span></Link>
      <Pop icon={<Bell size={17} />} label="Notifications" badge={unseen}>
        <div className="row" style={{ marginBottom: 6 }}><b className="grow">Notifications</b>
          <button className="btn sm ghost" onClick={() => { const v = new Date().toISOString(); setSeen(v); try { localStorage.setItem("cu.seenJobs", v); } catch { /* ignore */ } }}>Mark all read</button></div>
        {finished.length === 0 && <div className="dim" style={{ fontSize: 12.5 }}>Finished uploads, renders and AI jobs appear here.</div>}
        {finished.slice(0, 8).map((j) => <div key={j.id} className="gb-note">{j.status === "succeeded" ? <CheckCircle2 size={14} color="#4ade80" /> : <XCircle size={14} color="#fb7185" />}
          <div className="grow"><div>{jobLabel(j.kind)} {j.status === "succeeded" ? "finished" : "failed"}</div>{j.error && <div className="dim ellipsis" style={{ fontSize: 11 }}>{j.error}</div>}</div>
          <span className="dim" style={{ fontSize: 11 }}>{timeAgo(j.finished_at ?? j.created_at)}</span></div>)}
      </Pop>
      <Pop icon={<Gauge size={17} />} label="Usage">
        <b>Credits &amp; usage</b>
        <div className="gb-kv"><span>Plan</span><b>Early access</b></div>
        <div className="gb-kv"><span>Cloud renders &amp; AI</span><b>Free during early access</b></div>
        <div className="gb-kv"><span>Storage used</span><b>{sum ? fmtBytes(sum.storage_bytes) : "—"}</b></div>
        <div className="gb-kv"><span>Media files</span><b>{sum?.media_count ?? "—"}</b></div>
        <div className="gb-kv"><span>Jobs running</span><b>{sum?.active_jobs ?? "—"}</b></div>
        <div className="gb-kv"><span>Max upload</span><b>{sum ? fmtBytes(sum.limits.max_upload_bytes) : "—"}</b></div>
        <Link to="/settings#billing" className="dim" style={{ fontSize: 11, marginTop: 6, display: "block" }}>Plans and UPI / PayPal payment: Settings → Plans</Link>
      </Pop>
      <Pop icon={<Cpu size={17} />} label="Models" badge={0} wide>
        <div className="row"><b className="grow">Model &amp; engine status</b><span className="badge ok">{ready}/{caps.length} ready</span></div>
        <div className="gb-caps">{caps.filter((c) => c.ready).map((c) => <div key={c.id} className="gb-cap" title={c.needs}><CheckCircle2 size={13} color="#4ade80" /><span className="grow">{c.label}</span><span className="dim ellipsis" style={{ fontSize: 10.5, maxWidth: 170 }}>{c.needs}</span></div>)}</div>
        {ready < caps.length && <div className="dim" style={{ fontSize: 11, marginTop: 6 }}>{caps.length - ready} more appear automatically once their service is connected.</div>}
      </Pop>
      <Link to="/settings" className="btn icon ghost" title="Settings" aria-label="Settings"><Settings size={17} /></Link>
      <UserMenu />
    </header>
  );
}
