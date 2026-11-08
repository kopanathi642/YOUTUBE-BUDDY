import { CSSProperties, ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { ArrowLeft, Film, Orbit, Atom, Library, Lock, Youtube } from "lucide-react";
import GlobalBar from "./GlobalBar";
import { Universe, UNIVERSES } from "../universes";

const ICON = { editor: Film, ai: Orbit, super: Atom } as const;

/** Layout for the AI Generator / Super universes and shared pages: global bar + themed side nav. */
export default function UniverseShell({ u, nav, children }: { u: Universe | null; nav?: { to: string; label: string; icon: any }[]; children: ReactNode }) {
  const style = u ? ({ "--c1": u.c1, "--c2": u.c2, "--c3": u.c3 } as CSSProperties) : undefined;
  return (
    <div className={`ushell ${u?.hue ?? ""}`} style={style}>
      <GlobalBar sub={u ? u.title : "WORKSPACE"} />
      <div className="ushell-body">
        <aside className="ushell-side" aria-label="Universe navigation">
          <Link to="/universes" className="side-link"><ArrowLeft size={16} />Universe gateway</Link>
          <div className="side-h">Switch universe</div>
          {UNIVERSES.map((x) => { const I = ICON[x.id]; return (
            <NavLink key={x.id} to={x.route} className={({ isActive }) => `side-link uni-link ${isActive || u?.id === x.id ? "active" : ""}`} style={{ "--c1": x.c1 } as CSSProperties}>
              <I size={16} />{x.title.replace(" UNIVERSE", "").replace("AI GENERATOR", "AI Generator").replace("EDITOR", "Editor").replace("SUPER", "Super")}{x.locked && <Lock size={12} style={{ marginLeft: "auto", opacity: .7 }} aria-label="locked" />}</NavLink>); })}
          {nav && <><div className="side-h">{u?.title.toLowerCase().replace(/(^|\s)\S/g, (m) => m.toUpperCase())}</div>
            {nav.map((n) => <NavLink key={n.to} to={n.to} end className={({ isActive }) => `side-link ${isActive ? "active" : ""}`}><n.icon size={16} />{n.label}</NavLink>)}</>}
          <div className="side-h">Shared</div>
          <NavLink to="/library" className={({ isActive }) => `side-link ${isActive ? "active" : ""}`}><Library size={16} />Asset library</NavLink>
          <NavLink to="/channel" className={({ isActive }) => `side-link ${isActive ? "active" : ""}`}><Youtube size={16} />My channel</NavLink>
        </aside>
        <main className="ushell-main">{children}</main>
      </div>
    </div>
  );
}
