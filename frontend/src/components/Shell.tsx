import { ReactNode, useEffect, useRef, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import {
  Home, FolderOpen, Film, Sparkles, Smartphone, Clapperboard, Languages, Palette, AudioLines, Workflow, Type, Image,
  Download, LogOut, ChevronDown, Bell, Wand2, Orbit, Atom, Scissors, ArrowLeft, Library as LibraryIcon, Lock } from "lucide-react";
import { api } from "../api";
import { useAuth, useBrand } from "../App";

export function Brand({ small, sub = "EDITOR UNIVERSE" }: { small?: boolean; sub?: string }) {
  const brand = useBrand();
  const words = brand.split(" ");
  const head = words.slice(0, -1).join(" "), last = words[words.length - 1];
  return (
    <Link to="/" className="brand" aria-label={`${brand} home`}>
      <span className="brand-mark"><svg width="18" height="18" viewBox="0 0 32 32"><defs><linearGradient id="bg1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#22d3ee" /><stop offset="1" stopColor="#a855f7" /></linearGradient></defs><path d="M9 6l18 10-18 10z" fill="url(#bg1)" /></svg></span>
      {!small && <span className="brand-name">{head} <span className="grad-text">{last}</span><small>{sub}</small></span>}
    </Link>
  );
}

// Planned tools are visible (so the roadmap is clear) but labelled and inert — never fake buttons.
export const EDITOR_TOOLS: { label: string; icon: any }[] = [
  { label: "AI Magic (One-Click)", icon: Sparkles },
  { label: "Shorts Maker", icon: Smartphone },
  { label: "Clips & Reels", icon: Clapperboard },
  { label: "Subtitle & Translate", icon: Languages },
  { label: "Color Grading", icon: Palette },
  { label: "Audio Studio", icon: AudioLines },
  { label: "VFX & Fusion", icon: Workflow },
  { label: "Motion Graphics", icon: Type },
  { label: "Design & Thumbnail", icon: Image },
];

export function UserMenu() {
  const { me, setMe, workspace, setWorkspace } = useAuth();
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  if (!me) return null;
  const initials = me.user.display_name.split(/\s+/).map((s) => s[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button className="btn ghost" onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open}>
        {me.user.avatar_url ? <img className="avatar" src={me.user.avatar_url} alt="" referrerPolicy="no-referrer" /> : <span className="avatar">{initials}</span>}<span className="hide-m" style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" }}>{workspace?.name}</span><ChevronDown size={14} />
      </button>
      {open && (
        <div className="menu card" role="menu">
          <div className="dim" style={{ padding: "6px 10px", fontSize: 12 }}>{me.user.email}</div>
          <div className="side-h" style={{ padding: "8px 10px 4px" }}>Workspaces</div>
          {me.workspaces.map((w) => (
            <button key={w.id} role="menuitem" className={`menu-item ${w.id === workspace?.id ? "on" : ""}`} onClick={() => { setWorkspace(w.id); setOpen(false); nav("/editor"); }}>
              {w.name}<span className="badge" style={{ marginLeft: "auto" }}>{w.role}</span>
            </button>
          ))}
          <hr style={{ border: 0, borderTop: "1px solid var(--line)", margin: "6px 0" }} />
          <button role="menuitem" className="menu-item" onClick={async () => { await api("/auth/logout", { method: "POST" }); setMe(null); nav("/"); }}>
            <LogOut size={15} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export default function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="shell">
      <header className="topbar">
        <Brand />
        <nav className="topnav" aria-label="Primary">
          <NavLink to="/editor"><Home size={17} />Home</NavLink>
          <NavLink to="/editor/projects"><FolderOpen size={17} />Projects</NavLink>
          <NavLink to="/editor/projects?open=edit"><Scissors size={17} />Edit</NavLink>
          {[["AI", Wand2], ["Color", Palette], ["Audio", AudioLines], ["Fusion", Workflow], ["Graphics", Type]].map(([l, I]: any) => (
            <Link key={l} to="/editor/projects?open=edit" title={`${l} tools are inside the editor — open a project`}><I size={17} />{l}</Link>
          ))}
        </nav>
        <div className="grow" />
        <button className="btn icon ghost" title="Notifications (none yet)" aria-label="Notifications" disabled><Bell size={17} /></button>
        <UserMenu />
      </header>
      <aside className="sidebar" aria-label="Sidebar">
        <Link to="/universes" className="side-link"><ArrowLeft size={16} />Universe gateway</Link>
        <div className="universe-switch" aria-label="Switch universe">
          <Link to="/editor" className="universe on"><Film size={16} />Editor Universe</Link>
          <Link to="/ai-generator" className="universe"><Orbit size={16} />AI Generator Universe</Link>
          <Link to="/super" className="universe"><Atom size={16} />Super Universe<Lock size={12} style={{ marginLeft: "auto", opacity: .7 }} aria-label="locked" /></Link>
        </div>
        <div className="side-h">Workspace</div>
        <NavLink className={({ isActive }) => `side-link ${isActive ? "active" : ""}`} to="/editor"><Home size={17} />Dashboard</NavLink>
        <NavLink className={({ isActive }) => `side-link ${isActive ? "active" : ""}`} to="/editor/projects" end><FolderOpen size={17} />Projects</NavLink>
        <NavLink className="side-link" to="/editor/projects?open=edit"><Film size={17} />Video Editing</NavLink>
        <NavLink className="side-link" to="/editor/projects?open=export"><Download size={17} />Export & Share</NavLink>
        <NavLink className="side-link" to="/library"><LibraryIcon size={17} />Asset library</NavLink>
        <div className="side-h hide-m">Inside the editor</div>
        {EDITOR_TOOLS.map(({ label, icon: I }) => (
          <Link key={label} to="/editor/projects?open=edit" className="side-link hide-m" title="Open a project to use this tool">
            <I size={17} />{label}
          </Link>
        ))}
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
