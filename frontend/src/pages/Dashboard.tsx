import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, ArrowUpRight, FolderOpen, HardDrive, Activity, Film, Mic, Captions, Eraser, Languages, Image, Sparkles, Smartphone, MonitorPlay, Zap, HelpCircle, ChevronRight } from "lucide-react";
import { api, fmtBytes, Job, Project, timeAgo } from "../api";
import { useAuth } from "../App";
import { NewProjectModal, ProjectCard } from "./Projects";
import { jobLabel } from "../components/GlobalBar";
import { useCatalogue } from "../ai/core";

type Summary = { projects: number; media_count: number; storage_bytes: number; active_jobs: number };
const shortcuts = [
  { label: "AI Voiceover", icon: Mic, to: "/ai-generator/tool/041", description: "Convert script to natural speech" },
  { label: "Translate & Dub", icon: Languages, to: "/ai-generator/tool/104", description: "Reach audiences in 50+ languages" },
  { label: "Auto Captions", icon: Captions, to: "/ai-generator/tool/101", description: "Burn in styled viral subtitles" },
  { label: "Remove Background", icon: Eraser, to: "/ai-generator/tool/023", description: "Isolate subjects without a green screen" },
];

export default function Dashboard() {
  const { me, workspace } = useAuth();
  const { cat } = useCatalogue();
  const [sum, setSum] = useState<Summary | null>(null);
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [defaultFormat, setDefaultFormat] = useState<string | undefined>(undefined);
  const [showGuide, setShowGuide] = useState(false);

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

  const startWithFormat = (fmt: string) => {
    setDefaultFormat(fmt);
    setCreating(true);
  };

  return (
    <div className="dashboard">
      <header className="dash-heading">
        <div>
          <div className="dash-eyebrow-pill">
            <Sparkles size={13} /> <span>Creator Studio &amp; Video IDE</span>
          </div>
          <h1>Welcome back, {me?.user.display_name.split(" ")[0]}.</h1>
          <p className="muted">Ready to craft your next viral video or YouTube Short?</p>
        </div>
        <div className="dash-heading-actions">
          <button className="btn ghost sm" onClick={() => setShowGuide(!showGuide)} style={{ gap: 6 }}>
            <HelpCircle size={15} /> {showGuide ? "Hide Guide" : "How to Edit (Guide)"}
          </button>
          <Link className="btn ghost sm" to="/library"><Image size={15} />Asset Library</Link>
        </div>
      </header>

      {/* Beginner & Student 3-Step Guide Drawer */}
      {showGuide && (
        <section className="dash-guide-card" aria-label="Beginner editing guide">
          <div className="dash-guide-head">
            <Zap size={18} color="#A78BFA" />
            <b>So Simple, Even a 5th Grader Can Edit:</b>
            <span className="dim" style={{ fontSize: 12 }}>3 quick steps to finish your video</span>
          </div>
          <div className="dash-guide-steps">
            <div className="dash-guide-step">
              <span className="step-num">1</span>
              <div>
                <b>Click "New Project"</b>
                <p>Pick 16:9 for YouTube or 9:16 for TikTok/Shorts.</p>
              </div>
            </div>
            <div className="dash-guide-arrow"><ChevronRight size={16} /></div>
            <div className="dash-guide-step">
              <span className="step-num">2</span>
              <div>
                <b>Add Footage &amp; Trim</b>
                <p>Drag in videos or use AI Tools to generate voices &amp; auto-captions.</p>
              </div>
            </div>
            <div className="dash-guide-arrow"><ChevronRight size={16} /></div>
            <div className="dash-guide-step">
              <span className="step-num">3</span>
              <div>
                <b>Export &amp; Share</b>
                <p>Click Export for crystal clear, watermark-free 1080p/4K video.</p>
              </div>
            </div>
          </div>
        </section>
      )}

      {err && <div className="error-box" role="alert">{err} <button className="btn sm" onClick={load}>Retry</button></div>}

      {/* Hero Creation Banner with 1-Click Launchers */}
      <section className="dash-start" aria-label="Start creating">
        <div className="dash-start-copy">
          <span className="dash-feature-icon"><Film size={28} /></span>
          <div className="dash-copy-text">
            <h2>Make something extraordinary today.</h2>
            <p>Assemble clips on a multi-track timeline with instant auto-cut, cinema color grading, and studio sound.</p>
          </div>
          <div className="dash-cta-group">
            {canEdit && (
              <>
                <button className="btn primary lg dash-btn-glow" onClick={() => startWithFormat("landscape")}>
                  <MonitorPlay size={17} /> 16:9 YouTube Video
                </button>
                <button className="btn lg dash-btn-shorts" onClick={() => startWithFormat("vertical")}>
                  <Smartphone size={17} /> 9:16 Shorts / Reel
                </button>
              </>
            )}
          </div>
        </div>
        <Link className="dash-ai-link" to="/ai-generator">
          <div className="dash-ai-ic"><Sparkles size={24} /></div>
          <span>
            <b>Explore 100+ AI Tools</b>
            <small>Voiceovers, subtitles, translators, scripts &amp; image generation</small>
          </span>
          <ArrowUpRight size={20} />
        </Link>
      </section>

      {/* Stats Overview Tiles */}
      <div className="dash-stats" aria-label="Workspace overview">
        <div className="dash-stat-tile">
          <div className="dash-stat-ic"><FolderOpen size={20} /></div>
          <span><b>{sum?.projects ?? "—"}</b><small>Active Projects</small></span>
        </div>
        <div className="dash-stat-tile">
          <div className="dash-stat-ic"><Film size={20} /></div>
          <span><b>{sum?.media_count ?? "—"}</b><small>Media Clips</small></span>
        </div>
        <div className="dash-stat-tile">
          <div className="dash-stat-ic"><HardDrive size={20} /></div>
          <span><b>{sum ? fmtBytes(sum.storage_bytes) : "—"}</b><small>Cloud Storage</small></span>
        </div>
        <div className="dash-stat-tile">
          <div className="dash-stat-ic"><Activity size={20} /></div>
          <span><b>{sum?.active_jobs ?? "—"}</b><small>Rendering Jobs</small></span>
        </div>
      </div>

      <div className="dash-columns">
        <section aria-labelledby="recent-projects-heading">
          <div className="dash-section-head">
            <h2 id="recent-projects-heading">Recent Projects</h2>
            <Link to="/editor/projects">All projects <ArrowUpRight size={16} /></Link>
          </div>
          {!projects && !err && <div className="proj-grid" aria-label="Loading projects">{[0, 1].map((i) => <div key={i} className="skeleton dash-project-skeleton" />)}</div>}
          {projects?.length === 0 && (
            <div className="card empty dash-empty">
              <FolderOpen size={38} color="#A78BFA" />
              <h3>Your next story starts here</h3>
              <p>Create a project, then drop your footage directly onto the timeline.</p>
              {canEdit && (
                <button className="btn primary lg" onClick={() => setCreating(true)} style={{ marginTop: 12 }}>
                  <Plus size={18} /> Start Your First Video
                </button>
              )}
            </div>
          )}
          {!!projects?.length && <div className="proj-grid">{projects.map((p) => <ProjectCard key={p.id} p={p} />)}</div>}
        </section>

        <section className="dash-activity card" aria-labelledby="activity-heading">
          <div className="dash-section-head">
            <h2 id="activity-heading">Cloud Renders &amp; Activity</h2>
            <Activity size={17} />
          </div>
          {!sum && !err && <div className="skeleton dash-job-skeleton" aria-label="Loading activity" />}
          {sum && jobs.length === 0 && (
            <div className="dash-activity-empty">
              <Activity size={28} />
              <b>You're all caught up</b>
              <p>Your exports, uploads, and AI renders will display here live.</p>
            </div>
          )}
          {jobs.map((j) => (
            <div key={j.id} className="dash-job">
              <div className="row">
                <span className="grow font-medium">{jobLabel(j.kind)}</span>
                <span className={`badge ${j.status === "succeeded" ? "ok" : j.status === "failed" ? "err" : j.status === "canceled" ? "" : "info"}`}>{j.status}</span>
              </div>
              {(j.status === "running" || j.status === "queued") && (
                <div className="progress" role="progressbar" aria-label={jobLabel(j.kind)} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(j.progress * 100)}>
                  <i style={{ width: `${Math.round(j.progress * 100)}%` }} />
                </div>
              )}
              <p className="dim">{j.stage} · {timeAgo(j.created_at)}</p>
            </div>
          ))}
        </section>
      </div>

      {availableShortcuts.length > 0 && (
        <section aria-labelledby="quick-tools-heading">
          <div className="dash-section-head">
            <h2 id="quick-tools-heading">Essential AI Generators</h2>
            <Link to="/ai-generator">View full toolkit <ArrowUpRight size={16} /></Link>
          </div>
          <div className="dash-tools">
            {availableShortcuts.map(({ label, icon: Icon, to, description }) => (
              <Link key={to} to={to} className="dash-tool">
                <span><Icon size={22} /></span>
                <div><b>{label}</b><small>{description}</small></div>
                <ArrowUpRight size={16} />
              </Link>
            ))}
          </div>
        </section>
      )}

      {creating && <NewProjectModal initialFormat={defaultFormat} onClose={() => { setCreating(false); setDefaultFormat(undefined); }} />}
    </div>
  );
}
