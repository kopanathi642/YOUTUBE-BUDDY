import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, FolderOpen, HardDrive, Activity, Film, Mic, Captions, Eraser, Languages, Image } from "lucide-react";
import { api, fmtBytes, Job, Project, timeAgo } from "../api";
import { useAuth } from "../App";
import { NewProjectModal, ProjectCard } from "./Projects";
import { jobLabel } from "../components/GlobalBar";

type Summary = { projects: number; media_count: number; storage_bytes: number; active_jobs: number };


export default function Dashboard() {
  const { me, workspace } = useAuth();
  const [sum, setSum] = useState<Summary | null>(null);
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (!workspace) return;
    try {
      const [s, p, j] = await Promise.all([
        api<Summary>(`/workspaces/${workspace.id}/summary`),
        api<Project[]>(`/workspaces/${workspace.id}/projects`),
        api<Job[]>(`/workspaces/${workspace.id}/jobs`),
      ]);
      setSum(s); setProjects(p.slice(0, 4)); setJobs(j.slice(0, 6)); setErr(null);
    } catch (e) { setErr((e as Error).message); }
  }, [workspace]);
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, [load]);

  const canEdit = workspace?.role !== "viewer";
  return (
    <>
      <div className="page-h">
        <div><h1>Welcome back, {me?.user.display_name.split(" ")[0]} 👋</h1><div className="muted">What would you like to create today?</div></div>
        {canEdit && <button className="btn primary" onClick={() => setCreating(true)}><Plus size={16} />New project</button>}
      </div>
      {err && <div className="error-box" style={{ marginBottom: 16 }}>{err}</div>}

      <div className="quick" style={{ marginBottom: 22 }}>
        <button className="quick-tile" onClick={() => setCreating(true)} disabled={!canEdit}><span className="qi"><Film size={22} /></span><b>New Project</b><span className="dim" style={{ fontSize: 12 }}>Video editing</span></button>
        <Link className="quick-tile" to="/editor/projects"><span className="qi"><FolderOpen size={22} /></span><b>Open Project</b><span className="dim" style={{ fontSize: 12 }}>Continue editing</span></Link>
        {[["AI Voice", Mic, "/ai-creation?tool=voice", "Text to speech"], ["Translate & Dub", Languages, "/ai-creation?tool=dub", "AI Creation"], ["Captions", Captions, "/ai-creation?tool=transcribe", "Speech to text"], ["Remove background", Eraser, "/ai-creation?tool=bg", "AI Creation"], ["Asset library", Image, "/library", "All your media"]].map(([l, I, to, sub]: any) => (
          <Link key={l} className="quick-tile" to={to}><span className="qi"><I size={22} /></span><b>{l}</b><span className="dim" style={{ fontSize: 12 }}>{sub}</span></Link>
        ))}
      </div>

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", marginBottom: 22 }}>
        <div className="card stat"><span className="muted row"><FolderOpen size={15} />Active projects</span><b>{sum?.projects ?? "—"}</b></div>
        <div className="card stat"><span className="muted row"><Film size={15} />Media files</span><b>{sum?.media_count ?? "—"}</b></div>
        <div className="card stat"><span className="muted row"><HardDrive size={15} />Cloud storage used</span><b>{sum ? fmtBytes(sum.storage_bytes) : "—"}</b></div>
        <div className="card stat"><span className="muted row"><Activity size={15} />Jobs running</span><b>{sum?.active_jobs ?? "—"}</b></div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "minmax(0,2fr) minmax(280px,1fr)", alignItems: "start" }} id="dash-cols">
        <section className="card" style={{ padding: 18 }}>
          <div className="row" style={{ marginBottom: 14 }}><h3 style={{ margin: 0 }} className="grow">Recent projects</h3><Link to="/editor/projects" className="btn sm ghost">View all</Link></div>
          {!projects && <div className="proj-grid">{[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 170 }} />)}</div>}
          {projects?.length === 0 && <div className="empty"><div>No projects yet — create one to start editing.</div></div>}
          {projects && projects.length > 0 && <div className="proj-grid">{projects.map((p) => <ProjectCard key={p.id} p={p} />)}</div>}
        </section>
        <section className="card" style={{ padding: 18 }}>
          <h3 style={{ margin: "0 0 14px" }}>Recent cloud jobs</h3>
          {jobs.length === 0 && <div className="dim" style={{ fontSize: 13 }}>Uploads and exports you start will show here with their live status.</div>}
          <div className="grid" style={{ gap: 12 }}>
            {jobs.map((j) => (
              <div key={j.id}>
                <div className="row" style={{ fontSize: 13 }}>
                  <span className="grow">{jobLabel(j.kind)}</span>
                  <span className={`badge ${j.status === "succeeded" ? "ok" : j.status === "failed" ? "err" : j.status === "canceled" ? "" : "info"}`}>{j.status}</span>
                </div>
                {(j.status === "running" || j.status === "queued") && <div className="progress" style={{ marginTop: 6 }}><i style={{ width: `${Math.round(j.progress * 100)}%` }} /></div>}
                <div className="dim" style={{ fontSize: 11.5, marginTop: 3 }}>{j.stage ?? ""} {timeAgo(j.created_at)}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
      {creating && <NewProjectModal onClose={() => setCreating(false)} />}
    </>
  );
}
