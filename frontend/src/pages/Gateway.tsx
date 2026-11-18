import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Download, Film, FolderOpen, Play } from "lucide-react";
import { api, ExportRec, Job, Project, timeAgo } from "../api";
import { useAuth } from "../App";
import { jobLabel } from "../components/GlobalBar";
import CreatorUniverseView from "./CosmicLanding";

/** Signed-in home (/universes): the "Creator Universe" design, with the user's own work underneath. */
export default function Gateway() {
  const { workspace, me } = useAuth();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [exports, setExports] = useState<(ExportRec & { project_name: string })[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);

  useEffect(() => {
    if (!workspace) return;
    const load = () => {
      api<Project[]>(`/workspaces/${workspace.id}/projects`).then(setProjects).catch(() => setProjects([]));
      api<any[]>(`/workspaces/${workspace.id}/exports`).then(setExports).catch(() => {});
      api<Job[]>(`/workspaces/${workspace.id}/jobs`).then(setJobs).catch(() => {});
    };
    load();
    const t = setInterval(() => { if (!document.hidden) load(); }, 10000);
    return () => clearInterval(t);
  }, [workspace]);

  const first = me?.user.display_name.split(" ")[0];
  const running = jobs.filter((j) => j.status === "queued" || j.status === "running");

  return (
    <CreatorUniverseView name={first}>
      <section className="cu-wrap" aria-labelledby="work-h">
        <div className="cu-title" style={{ marginTop: 40 }}><h2 id="work-h">Your work</h2></div>
        <div className="cu-work">
          <div className="cu-wcard">
            <h3>Continue editing</h3>
            {projects === null ? <p className="cu-dim">Loading…</p> : projects.length === 0 ? (
              <><p className="cu-dim">No projects yet.</p><Link to="/editor" className="cu-wbtn"><Play size={14} fill="#fff" strokeWidth={0} />Start your first video</Link></>
            ) : projects.slice(0, 4).map((p) => (
              <Link key={p.id} to={`/edit/${p.id}`} className="cu-wrow"><Film size={15} aria-hidden /><span className="cu-grow">{p.name}</span><span className="cu-dim">{timeAgo(p.updated_at)}</span></Link>
            ))}
            {projects && projects.length > 0 && <Link to="/editor/projects" className="cu-wmore">All projects<ArrowRight size={14} /></Link>}
          </div>
          <div className="cu-wcard">
            <h3>Finished videos</h3>
            {exports.length === 0 ? <p className="cu-dim">Your exported videos appear here.</p> : exports.slice(0, 4).map((e) => (
              <div key={e.id} className="cu-wrow"><span className="cu-grow">{e.project_name} · {e.settings.width}×{e.settings.height}</span>
                {e.download_url ? <a href={e.download_url} className="cu-icon" aria-label={`Download ${e.project_name}`}><Download size={15} /></a> : <span className="cu-dim">{e.job.status}</span>}</div>
            ))}
          </div>
          <div className="cu-wcard">
            <h3>Working on it {running.length > 0 && <span className="cu-chip">{running.length} running</span>}</h3>
            {jobs.length === 0 ? <p className="cu-dim">Nothing running right now.</p> : jobs.slice(0, 4).map((j) => (
              <div key={j.id} className="cu-wrow"><span className="cu-grow">{jobLabel(j.kind)}</span>
                {j.status === "running" ? <span className="cu-bar"><i style={{ width: `${Math.round(j.progress * 100)}%` }} /></span>
                  : <span className={`cu-st ${j.status}`}>{j.status === "succeeded" ? "done" : j.status}</span>}</div>
            ))}
            <Link to="/library" className="cu-wmore"><FolderOpen size={14} />All my files</Link>
          </div>
        </div>
      </section>
      <div style={{ height: 60 }} />
    </CreatorUniverseView>
  );
}
