import { useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import { api } from "../api";
import { useAuth, useBrand } from "../App";
import UniverseShell from "../components/UniverseShell";
import TeamCard from "../components/TeamCard";

export default function Settings() {
  const { me, workspace, setWorkspace, setMe } = useAuth();
  const brand = useBrand();
  const nav = useNavigate();
  if (!me) return null;
  return (
    <UniverseShell u={null}>
      <div className="page-h"><h1>Settings</h1></div>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 16, alignItems: "start" }}>
        <section className="card" style={{ padding: 18 }}>
          <b>Account</b>
          <div className="gb-kv"><span>Name</span><b>{me.user.display_name}</b></div>
          <div className="gb-kv"><span>Email</span><b>{me.user.email}</b></div>
          <div className="gb-kv"><span>Sign-in</span><b>{[me.user.has_password !== false && "Password", me.user.google_linked && "Google"].filter(Boolean).join(" + ")}</b></div>
          <div className="gb-kv"><span>Email verified</span><b>{me.user.email_verified ? "Yes" : "Not yet (needs email service)"}</b></div>
          <button className="btn" style={{ marginTop: 12 }} onClick={async () => { await api("/auth/logout", { method: "POST" }); setMe(null); nav("/"); }}><LogOut size={14} />Sign out</button>
        </section>
        <section className="card" style={{ padding: 18 }}>
          <b>Workspaces</b>
          {me.workspaces.map((w) => <div key={w.id} className="gw-row" style={{ padding: "6px 0" }}>
            <span className="grow">{w.name}</span><span className="badge">{w.role}</span>
            {w.id === workspace?.id ? <span className="badge ok">current</span> : <button className="btn sm" onClick={() => setWorkspace(w.id)}>Switch</button>}</div>)}
          <div className="dim" style={{ fontSize: 12, marginTop: 8 }}>Create a team workspace and add members in the Team card.</div>
        </section>
        <TeamCard />
        <section className="card" style={{ padding: 18 }}>
          <b>About</b>
          <div className="gb-kv"><span>Product</span><b>{brand}</b></div>
          <div className="gb-kv"><span>Plan</span><b>Early access</b></div>
          <div className="dim" style={{ fontSize: 12, marginTop: 8 }}>Privacy policy and terms will be published after legal review.</div>
        </section>
      </div>
    </UniverseShell>
  );
}
