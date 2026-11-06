import { FormEvent, useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Users } from "lucide-react";
import { api } from "../api";
import { useAuth, useToast } from "../App";

type Member = { user_id: string; email: string; display_name: string; role: string };

/** Team members + team workspaces for the current workspace (used in Settings and the Super Universe). */
export default function TeamCard() {
  const { workspace, me, refresh, setWorkspace } = useAuth();
  const toast = useToast();
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState(""), [role, setRole] = useState("editor"), [teamName, setTeamName] = useState("");
  const canAdmin = workspace?.role === "owner" || workspace?.role === "admin";
  const load = useCallback(() => { if (workspace) api<Member[]>(`/workspaces/${workspace.id}/members`).then(setMembers).catch(() => {}); }, [workspace]);
  useEffect(load, [load]);

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
  return (
    <section className="card" style={{ padding: 16 }} id="team">
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
  );
}
