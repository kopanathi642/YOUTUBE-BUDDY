import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, ArrowUpRight, FolderOpen, HardDrive, Activity, Film, Mic, Captions, Eraser, Languages, Image, Sparkles } from "lucide-react";
import { api, fmtBytes, Job, Project, timeAgo } from "../api";
import { useAuth } from "../App";
import { NewProjectModal, ProjectCard } from "./Projects";
import { jobLabel } from "../components/GlobalBar";
import { useCatalogue } from "../ai/core";

type Summary = { projects: number; media_count: number; storage_bytes: number; active_jobs: number };
const shortcuts = [
  { label: "AI voice", icon: Mic, to: "/ai-generator/tool/041", description: "Turn text into speech" },
  { label: "Translate & dub", icon: Languages, to: "/ai-generator/tool/104", description: "Reach another language" },
  { label: "Captions", icon: Captions, to: "/ai-generator/tool/101", description: "Make every word clear" },
  { label: "Remove background", icon: Eraser, to: "/ai-generator/tool/023", description: "Focus on your subject" },
];

export default function Dashboard() {
  const { me, workspace } = useAuth();
  const { cat } = useCatalogue();
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

  const canEdit = !!workspace && workspace.role !== "viewer";
  const availableShortcuts = shortcuts.filter((shortcut) => cat?.tools.some((tool) => shortcut.to.endsWith(`/${tool.id}`)));
  return (
    <div className="dashboard">
      <header className="dash-heading">
        <div><p className="dash-eyebrow">Your workspace</p><h1>Welcome back, {me?.user.display_name.split(" ")[0]}.</h1><p className="muted">Pick up your next great video.</p></div>
        <Link className="btn ghost" to="/library"><Image size={17} />Asset library</Link>
      </header>
      {err && <div className="error-box" role="alert">{err} <button className="btn sm" onClick={load}>Retry</button></div>}
      <section className="dash-start" aria-label="Start creating">
        <div className="dash-start-copy">
          <span className="dash-feature-icon"><Film size={26} /></span>
          <div><h2>Make something worth watching.</h2><p>Bring your clips together. Find your story. Make it yours.</p></div>
          {canEdit && <button className="btn primary lg" onClick={() => setCreating(true)}><Plus size={18} />New project</button>}
        </div>
        <Link className="dash-ai-link" to="/ai-generator"><Sparkles size={24} /><span><b>Create with AI</b><small>Explore your available tools</small></span><ArrowUpRight size={20} /></Link>
      </section>
      <div className="dash-stats" aria-label="Workspace overview">
        <div><FolderOpen size={18} /><span><b>{sum?.projects ?? "—"}</b><small>Projects</small></span></div>
        <div><Film size={18} /><span><b>{sum?.media_count ?? "—"}</b><small>Media files</small></span></div>
        <div><HardDrive size={18} /><span><b>{sum ? fmtBytes(sum.storage_bytes) : "—"}</b><small>Storage used</small></span></div>
        <div><Activity size={18} /><span><b>{sum?.active_jobs ?? "—"}</b><small>Jobs running</small></span></div>
      </div>
      <div className="dash-columns">
        <section aria-labelledby="recent-projects-heading">
          <div className="dash-section-head"><h2 id="recent-projects-heading">Continue creating</h2><Link to="/editor/projects">All projects <ArrowUpRight size={16} /></Link></div>
          {!projects && !err && <div className="proj-grid" aria-label="Loading projects">{[0, 1].map((i) => <div key={i} className="skeleton dash-project-skeleton" />)}</div>}
          {projects?.length === 0 && <div className="card empty dash-empty"><FolderOpen size={34} /><h3>Your next story starts here</h3><p>Create a project, then add your footage to the timeline.</p>{canEdit && <button className="btn primary" onClick={() => setCreating(true)}><Plus size={16} />Create a project</button>}</div>}
          {!!projects?.length && <div className="proj-grid">{projects.map((p) => <ProjectCard key={p.id} p={p} />)}</div>}
        </section>
        <section className="dash-activity card" aria-labelledby="activity-heading">
          <div className="dash-section-head"><h2 id="activity-heading">Activity</h2><Activity size={17} /></div>
          {!sum && !err && <div className="skeleton dash-job-skeleton" aria-label="Loading activity" />}
          {sum && jobs.length === 0 && <div className="dash-activity-empty"><Activity size={28} /><b>You're all caught up</b><p>Your uploads and exports will appear here.</p></div>}
          {jobs.map((j) => (
            <div key={j.id} className="dash-job">
              <div className="row"><span className="grow">{jobLabel(j.kind)}</span><span className={`badge ${j.status === "succeeded" ? "ok" : j.status === "failed" ? "err" : j.status === "canceled" ? "" : "info"}`}>{j.status}</span></div>
              {(j.status === "running" || j.status === "queued") && <div className="progress" role="progressbar" aria-label={jobLabel(j.kind)} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(j.progress * 100)}><i style={{ width: `${Math.round(j.progress * 100)}%` }} /></div>}
              <p className="dim">{j.stage} · {timeAgo(j.created_at)}</p>
            </div>
          ))}
        </section>
      </div>
      {availableShortcuts.length > 0 && <section aria-labelledby="quick-tools-heading">
        <div className="dash-section-head"><h2 id="quick-tools-heading">Finishing touches</h2><Link to="/ai-generator">Explore tools <ArrowUpRight size={16} /></Link></div>
        <div className="dash-tools">{availableShortcuts.map(({ label, icon: Icon, to, description }) => <Link key={to} to={to} className="dash-tool"><span><Icon size={21} /></span><div><b>{label}</b><small>{description}</small></div><ArrowUpRight size={16} /></Link>)}</div>
      </section>}
      {creating && <NewProjectModal onClose={() => setCreating(false)} />}
    </div>
  );
}
