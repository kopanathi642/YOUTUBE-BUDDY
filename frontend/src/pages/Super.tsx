import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, Users, Cpu, Film, HardDrive, FolderOpen, X, CheckCircle2, Lock, Workflow, Plus, Trash2, Orbit } from "lucide-react";
import { api, fmtBytes, Job, Project, timeAgo } from "../api";
import { useAuth, useToast } from "../App";
import UniverseShell from "../components/UniverseShell";
import { jobLabel } from "../components/GlobalBar";
import { universeById } from "../universes";

type Member = { user_id: string; email: string; display_name: string; role: string };
type Summary = { projects: number; media_count: number; storage_bytes: number; active_jobs: number };
const AI = ["ai.tts", "ai.transcribe", "ai.translate", "ai.dub", "media.derive"];

/** Shown while the Super Universe is locked (universes.ts → locked: true). */
export function SuperLocked() {
  const u = universeById("super");
  return (
    <UniverseShell u={u}>
      <div className="card super-locked" style={{ maxWidth: 720, margin: "40px auto", padding: 32, textAlign: "center" }}>
        <div style={{ width: 64, height: 64, borderRadius: 18, margin: "0 auto 14px", display: "grid", placeItems: "center", background: "linear-gradient(135deg,#10b981,#06b6d4)", color: "#fff" }}><Lock size={28} /></div>
        <h1 style={{ margin: "0 0 6px" }}>Super Universe is locked</h1>
        <p className="muted" style={{ margin: "0 auto 18px", maxWidth: 520 }}>It opens in a later release as the command centre that ties the Editor and AI Generator universes together. Until then, everything you need lives in those two universes.</p>
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10, textAlign: "left", marginBottom: 20 }}>
          {["Cross-universe command centre", "Autonomous creative workflows", "Scheduled automations & publishing", "Project intelligence & insights"].map((t) =>
            <div key={t} className="gw-row" style={{ padding: "8px 10px", border: "1px dashed var(--line)", borderRadius: 10 }}><Lock size={13} className="dim" /><span>{t}</span></div>)}
        </div>
        <div className="row" style={{ justifyContent: "center", gap: 10, flexWrap: "wrap" }}>
          <Link className="btn primary" to="/editor"><Film size={15} />Editor Universe</Link>
          <Link className="btn" to="/ai-generator"><Orbit size={15} />AI Generator Universe</Link>
          <Link className="btn ghost" to="/settings#team"><Users size={15} />Team & workspaces</Link>
        </div>
      </div>
    </UniverseShell>
  );
}

export default function Super() {
  const u = universeById("super");
  const { workspace, me, refresh, setWorkspace } = useAuth();
  const toast = useToast();
  const [sum, setSum] = useState<Summary | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [filter, setFilter] = useState<"all" | "active" | "failed">("all");
  const [caps, setCaps] = useState<{ id: string; label: string; ready: boolean; needs: string }[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState(""), [role, setRole] = useState("editor"), [teamName, setTeamName] = useState("");
  const canAdmin = workspace?.role === "owner" || workspace?.role === "admin";

  const load = useCallback(() => {
    if (!workspace) return;
    api<Summary>(`/workspaces/${workspace.id}/summary`).then(setSum).catch(() => {});
    api<Job[]>(`/workspaces/${workspace.id}/jobs`).then(setJobs).catch(() => {});
    api<Project[]>(`/workspaces/${workspace.id}/projects`).then(setProjects).catch(() => {});
    api<Member[]>(`/workspaces/${workspace.id}/members`).then(setMembers).catch(() => {});
  }, [workspace]);
  useEffect(() => { load(); api<any[]>("/ai/capabilities").then(setCaps).catch(() => {}); const t = setInterval(load, 4000); return () => clearInterval(t); }, [load]);

  async function addMember(e: FormEvent) {
    e.preventDefault();
    try { await api(`/workspaces/${workspace!.id}/members`, { method: "POST", body: { email, role } }); setEmail(""); toast("Member added"); load(); }
    catch (err) { toast((err as Error).message); }
  }
  async function createTeam(e: FormEvent) {
    e.preventDefault();
    try { const w = await api<{ id: string }>("/workspaces", { method: "POST", body: { name: teamName } }); await refresh(); setWorkspace(w.id); setTeamName(""); toast("Team workspace created and opened"); }
    catch (err) { toast((err as Error).message); }
  }

  const shown = jobs.filter((j) => filter === "all" || (filter === "active" ? ["queued", "running"].includes(j.status) : j.status === "failed"));
  const ready = caps.filter((c) => c.ready).length;
  return (
    <UniverseShell u={u}>
      <div className="page-h"><div><h1>Super Universe · Command Center</h1><div className="muted">Everything across your universes in one place — {workspace?.name}.</div></div></div>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", marginBottom: 16 }}>
        <div className="card stat"><span className="muted row"><FolderOpen size={15} />Projects</span><b>{sum?.projects ?? "—"}</b></div>
        <div className="card stat"><span className="muted row"><Film size={15} />Media files</span><b>{sum?.media_count ?? "—"}</b></div>
        <div className="card stat"><span className="muted row"><HardDrive size={15} />Storage</span><b>{sum ? fmtBytes(sum.storage_bytes) : "—"}</b></div>
        <div className="card stat"><span className="muted row"><Activity size={15} />Jobs running</span><b>{sum?.active_jobs ?? "—"}</b></div>
        <div className="card stat"><span className="muted row"><Cpu size={15} />Engines ready</span><b>{ready}/{caps.length}</b></div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 12, marginBottom: 16 }} id="uni-status">
        {[["Editor Universe", "/editor", `${sum?.projects ?? 0} projects`, Film, "#2563eb"], ["AI Generator Universe", "/ai-generator", `${jobs.filter((j) => AI.includes(j.kind)).length} recent AI jobs`, Orbit, "#a855f7"],
          ["Super Universe", "/super", "you are here", Workflow, "#10b981"]].map(([t, to, d, I, c]: any) => (
          <Link key={t} to={to} className="card uni-status" style={{ borderColor: c }}><I size={20} color={c} /><div><b>{t}</b><div className="dim" style={{ fontSize: 12 }}>{d}</div></div></Link>))}
      </div>
      <div className="grid super-grid">
        <section className="card" style={{ padding: 16 }}>
          <div className="row" style={{ marginBottom: 8 }}><Activity size={15} /><b className="grow">Job board</b>
            <div className="seg">{(["all", "active", "failed"] as const).map((f) => <button key={f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>{f}</button>)}</div></div>
          {shown.length === 0 && <div className="dim" style={{ fontSize: 12.5 }}>No jobs in this view.</div>}
          {shown.map((j) => (
            <div key={j.id} className="job-row">
              <span className="grow"><b>{jobLabel(j.kind)}</b>{j.project_id && <Link to={`/edit/${j.project_id}`} className="dim" style={{ fontSize: 11, marginLeft: 6 }}>open project</Link>}
                {j.error && <div className="dim ellipsis" style={{ fontSize: 11 }} title={j.error}>{j.error}</div>}</span>
              {j.status === "running" ? <><div className="progress" style={{ width: 90 }}><i style={{ width: `${Math.round(j.progress * 100)}%` }} /></div><span className="mono dim" style={{ fontSize: 11 }}>{j.stage}</span></>
                : <span className={`badge ${j.status === "succeeded" ? "ok" : j.status === "failed" ? "err" : ""}`}>{j.status}</span>}
              {["queued", "running"].includes(j.status) && workspace?.role !== "viewer" && <button className="btn icon ghost xs" aria-label="Cancel job" title="Cancel" onClick={async () => { await api(`/jobs/${j.id}/cancel`, { method: "POST" }); load(); }}><X size={13} /></button>}
              <span className="dim" style={{ fontSize: 11, width: 64, textAlign: "right" }}>{timeAgo(j.created_at)}</span>
            </div>))}
        </section>
        <section className="card" style={{ padding: 16 }}>
          <div className="row" style={{ marginBottom: 8 }}><Cpu size={15} /><b>Models &amp; engines</b></div>
          {caps.map((c) => <div key={c.id} className="gb-cap" title={c.needs}>{c.ready ? <CheckCircle2 size={13} color="#4ade80" /> : <Lock size={12} className="dim" />}<span className="grow">{c.label}</span><span className="dim ellipsis" style={{ fontSize: 10.5, maxWidth: 200 }}>{c.needs}</span></div>)}
        </section>
        <section className="card" style={{ padding: 16 }}>
          <div className="row" style={{ marginBottom: 8 }}><Users size={15} /><b>Team</b><span className="badge" style={{ marginLeft: 6 }}>{workspace?.is_personal ? "personal workspace" : "team workspace"}</span></div>
          {members.map((m) => <div key={m.user_id} className="gw-row"><span className="avatar" style={{ width: 24, height: 24, fontSize: 10 }}>{m.display_name.slice(0, 2).toUpperCase()}</span>
            <span className="grow ellipsis">{m.display_name} <span className="dim">· {m.email}</span></span><span className="badge">{m.role}</span>
            {canAdmin && m.role !== "owner" && m.user_id !== me?.user.id && <button className="btn icon ghost xs" aria-label={`Remove ${m.display_name}`} onClick={async () => { try { await api(`/workspaces/${workspace!.id}/members/${m.user_id}`, { method: "DELETE" }); load(); } catch (e) { toast((e as Error).message); } }}><Trash2 size={12} /></button>}</div>)}
          {workspace?.is_personal ? <form onSubmit={createTeam} className="row" style={{ marginTop: 10 }}>
            <input className="input" placeholder="New team workspace name" value={teamName} onChange={(e) => setTeamName(e.target.value)} required maxLength={120} aria-label="Team name" />
            <button className="btn primary"><Plus size={14} />Create team</button></form>
            : canAdmin && <form onSubmit={addMember} className="row" style={{ marginTop: 10, flexWrap: "wrap" }}>
              <input className="input grow" type="email" placeholder="teammate@email.com (must have an account)" value={email} onChange={(e) => setEmail(e.target.value)} required aria-label="Member email" />
              <select className="select" style={{ width: 110 }} value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role"><option value="editor">Editor</option><option value="viewer">Viewer</option>{workspace?.role === "owner" && <option value="admin">Admin</option>}</select>
              <button className="btn primary"><Plus size={14} />Add</button></form>}
        </section>
        <section className="card" style={{ padding: 16 }}>
          <div className="row" style={{ marginBottom: 8 }}><FolderOpen size={15} /><b>All projects</b></div>
          {projects.length === 0 && <div className="dim" style={{ fontSize: 12.5 }}>No projects yet.</div>}
          {projects.slice(0, 10).map((p) => <Link key={p.id} to={`/edit/${p.id}`} className="gw-row"><Film size={13} /><span className="grow ellipsis">{p.name}</span><span className="dim">{p.media_count} media · {timeAgo(p.updated_at)}</span></Link>)}
        </section>
        <section className="card" style={{ padding: 16, gridColumn: "1 / -1" }}>
          <div className="row" style={{ marginBottom: 8 }}><Lock size={14} /><b>On the roadmap</b><span className="dim" style={{ fontSize: 11.5, marginLeft: 6 }}>not available yet</span></div>
          <div className="roadmap">{["Autonomous creative workflows", "Multi-universe orchestration", "Scheduled automations & publishing", "Project intelligence & insights", "Model & tool routing", "Usage budgets & billing (Buddy Credits)"].map((t) => <div key={t} className="rm"><Workflow size={16} /><b>{t}</b></div>)}</div>
        </section>
      </div>
    </UniverseShell>
  );
}
