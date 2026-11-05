import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Plus, Search, Film, Archive, ArchiveRestore, Trash2, MonitorPlay, Smartphone, Square } from "lucide-react";
import { api, Project, timeAgo } from "../api";
import { useAuth, useToast } from "../App";

export function NewProjectModal({ onClose }: { onClose: () => void }) {
  const { workspace } = useAuth();
  const nav = useNavigate();
  const [name, setName] = useState("Untitled project");
  const [format, setFormat] = useState("landscape");
  const [fps, setFps] = useState(30);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!workspace) return;
    setBusy(true); setErr(null);
    try {
      const p = await api<Project>(`/workspaces/${workspace.id}/projects`, { method: "POST", body: { name, format, fps } });
      nav(`/edit/${p.id}`);
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  }
  const fmts = [
    { id: "landscape", label: "16:9 · 1920×1080", icon: MonitorPlay },
    { id: "vertical", label: "9:16 · 1080×1920", icon: Smartphone },
    { id: "square", label: "1:1 · 1080×1080", icon: Square },
  ];
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="card modal" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="np-h">
        <h2 id="np-h" style={{ margin: "0 0 16px", fontSize: 19 }}>New project</h2>
        <label className="label" htmlFor="np-name">Name</label>
        <input id="np-name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus required maxLength={200} />
        <div className="label" style={{ marginTop: 16 }}>Sequence format</div>
        <div className="grid" style={{ gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
          {fmts.map(({ id, label, icon: I }) => (
            <button type="button" key={id} className={`fmt ${format === id ? "on" : ""}`} onClick={() => setFormat(id)} aria-pressed={format === id}>
              <I size={20} /><span>{label}</span>
            </button>
          ))}
        </div>
        <label className="label" htmlFor="np-fps" style={{ marginTop: 16 }}>Frame rate</label>
        <select id="np-fps" className="select" value={fps} onChange={(e) => setFps(+e.target.value)}>
          {[24, 25, 30, 50, 60].map((f) => <option key={f} value={f}>{f} fps</option>)}
        </select>
        {err && <div className="error-box" style={{ marginTop: 12 }}>{err}</div>}
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 20 }}>
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy || !name.trim()}>{busy ? <span className="spinner" /> : "Create & open editor"}</button>
        </div>
      </form>
    </div>
  );
}

export function ProjectCard({ p, actions }: { p: Project; actions?: React.ReactNode }) {
  return (
    <div className="card proj-card">
      <Link to={`/edit/${p.id}`} aria-label={`Open ${p.name}`}>
        <div className="proj-thumb"><Film size={30} color="#a78bfa" /></div>
      </Link>
      <div style={{ padding: "10px 12px" }}>
        <div className="row"><Link to={`/edit/${p.id}`} className="grow" style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</Link>{actions}</div>
        <div className="dim" style={{ fontSize: 12 }}>{p.media_count ?? 0} media · edited {timeAgo(p.updated_at)}</div>
      </div>
    </div>
  );
}

export default function Projects() {
  const { workspace } = useAuth();
  const toast = useToast();
  const [params] = useSearchParams();
  const [q, setQ] = useState("");
  const [archived, setArchived] = useState(false);
  const [sort, setSort] = useState("updated");
  const [items, setItems] = useState<Project[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const canEdit = workspace && workspace.role !== "viewer";

  const load = useCallback(async () => {
    if (!workspace) return;
    setErr(null);
    try { setItems(await api<Project[]>(`/workspaces/${workspace.id}/projects?archived=${archived}&sort=${sort}${q ? `&q=${encodeURIComponent(q)}` : ""}`)); }
    catch (e) { setErr((e as Error).message); }
  }, [workspace, archived, sort, q]);
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);

  async function act(p: Project, what: "archive" | "restore" | "delete") {
    if (what === "delete" && !confirm(`Delete "${p.name}"? It disappears from your workspace.`)) return;
    try {
      if (what === "delete") await api(`/projects/${p.id}`, { method: "DELETE" });
      else await api(`/projects/${p.id}`, { method: "PATCH", body: { archived: what === "archive" } });
      toast(what === "delete" ? "Project deleted" : what === "archive" ? "Project archived" : "Project restored");
      load();
    } catch (e) { toast((e as Error).message); }
  }

  const hint = params.get("open");
  return (
    <>
      <div className="page-h">
        <div><h1>Projects</h1><div className="muted">{workspace?.name}</div></div>
        {canEdit && <button className="btn primary" onClick={() => setCreating(true)}><Plus size={16} />New project</button>}
      </div>
      {hint && <div className="card" style={{ padding: "10px 14px", marginBottom: 16 }}>Pick a project to {hint === "export" ? "export from (Export is in the editor's bottom-right panel)" : "open in the editor"}.</div>}
      <div className="row" style={{ marginBottom: 16, flexWrap: "wrap" }}>
        <div className="row" style={{ position: "relative", flex: "1 1 240px", maxWidth: 360 }}>
          <Search size={15} style={{ position: "absolute", left: 11 }} className="dim" />
          <input className="input" style={{ paddingLeft: 32 }} placeholder="Search projects" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search projects" />
        </div>
        <div className="seg" role="group" aria-label="Filter">
          <button className={!archived ? "on" : ""} onClick={() => setArchived(false)}>Active</button>
          <button className={archived ? "on" : ""} onClick={() => setArchived(true)}>Archived</button>
        </div>
        <select className="select" style={{ width: 170 }} value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
          <option value="updated">Recently edited</option><option value="name">Name A–Z</option>
        </select>
      </div>
      {err && <div className="error-box">{err} <button className="btn sm" onClick={load}>Retry</button></div>}
      {!items && !err && <div className="proj-grid">{Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton" style={{ height: 190 }} />)}</div>}
      {items && items.length === 0 && (
        <div className="card empty"><Film size={36} color="#a78bfa" />
          <div>{q ? "No projects match your search." : archived ? "No archived projects." : "No projects yet."}</div>
          {canEdit && !archived && !q && <button className="btn primary" onClick={() => setCreating(true)}><Plus size={16} />Create your first project</button>}
        </div>
      )}
      {items && items.length > 0 && (
        <div className="proj-grid">
          {items.map((p) => (
            <ProjectCard key={p.id} p={p} actions={canEdit && <div className="row" style={{ gap: 2 }}>
              {archived ? <button className="btn icon ghost" title="Restore" aria-label="Restore" onClick={() => act(p, "restore")}><ArchiveRestore size={15} /></button>
                : <button className="btn icon ghost" title="Archive" aria-label="Archive" onClick={() => act(p, "archive")}><Archive size={15} /></button>}
              {(workspace!.role === "owner" || workspace!.role === "admin") && <button className="btn icon ghost" title="Delete" aria-label="Delete" onClick={() => act(p, "delete")}><Trash2 size={15} /></button>}
            </div>} />
          ))}
        </div>
      )}
      {creating && <NewProjectModal onClose={() => setCreating(false)} />}
    </>
  );
}
