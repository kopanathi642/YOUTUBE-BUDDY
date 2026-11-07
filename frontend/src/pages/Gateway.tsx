import { CSSProperties, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Download, Film, Play, Cpu, CheckCircle2, Lock } from "lucide-react";
import { api, ExportRec, Job, Project, timeAgo } from "../api";
import { useAuth, useToast } from "../App";
import GlobalBar, { jobLabel } from "../components/GlobalBar";
import { UNIVERSES, Universe } from "../universes";

const reducedMotion = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Lightweight starfield + coloured dust. Adapts particle count to the device and pauses when hidden. */
function Particles({ mouse }: { mouse: React.MutableRefObject<{ x: number; y: number }> }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!, g = cv.getContext("2d")!;
    const still = reducedMotion();
    const cores = navigator.hardwareConcurrency || 4;
    const N = Math.round(Math.min(220, Math.max(60, cores * 22)) * (window.innerWidth < 700 ? 0.5 : 1));
    const cols = ["#93c5fd", "#c4b5fd", "#6ee7b7", "#ffffff", "#f0abfc"];
    const P = Array.from({ length: N }, () => ({ x: Math.random(), y: Math.random(), z: Math.random() * 0.9 + 0.1, r: Math.random() * 1.6 + 0.3, c: cols[(Math.random() * cols.length) | 0], v: Math.random() * 0.00025 + 0.00005 }));
    let raf = 0, w = 0, h = 0;
    const size = () => { const dpr = Math.min(2, devicePixelRatio || 1); w = cv.clientWidth; h = cv.clientHeight; cv.width = w * dpr; cv.height = h * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0); };
    size(); addEventListener("resize", size);
    const draw = () => {
      g.clearRect(0, 0, w, h);
      const mx = (mouse.current.x - 0.5) * 40, my = (mouse.current.y - 0.5) * 30;
      for (const p of P) {
        if (!still) { p.y -= p.v * p.z; if (p.y < -0.02) { p.y = 1.02; p.x = Math.random(); } }
        g.globalAlpha = 0.25 + p.z * 0.6; g.fillStyle = p.c;
        g.beginPath(); g.arc(p.x * w + mx * p.z, p.y * h + my * p.z, p.r * p.z * 1.4, 0, 6.283); g.fill();
      }
      if (!still && !document.hidden) raf = requestAnimationFrame(draw);
    };
    const vis = () => { if (!document.hidden && !still) { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); } };
    document.addEventListener("visibilitychange", vis);
    draw();
    return () => { cancelAnimationFrame(raf); removeEventListener("resize", size); document.removeEventListener("visibilitychange", vis); };
  }, [mouse]);
  return <canvas ref={ref} className="gw-particles" aria-hidden />;
}

/** Scene art inside each portal — pure CSS/SVG, GPU-friendly transforms only. */
function Scene({ u }: { u: Universe }) {
  if (u.id === "editor") return (
    <div className="sc sc-editor" aria-hidden>
      <div className="sc-monitor"><div className="sc-video" /><div className="sc-play" /></div>
      <div className="sc-panel p1"><i /><i /><i /><i /></div>
      <div className="sc-panel p2"><b /><b /><b /></div>
      <div className="sc-timeline">
        {[0, 1, 2].map((r) => <div key={r} className={`sc-track t${r}`}><span /><span /><span /></div>)}
        <div className="sc-playhead" />
      </div>
    </div>
  );
  if (u.id === "ai") {
    const L = [[30, 60, 90, 120], [45, 75, 105], [30, 60, 90, 120]];
    const nodes = L.flatMap((col, ci) => col.map((y) => ({ x: 40 + ci * 80, y })));
    const edges: [number, number, number, number][] = [];
    L.forEach((col, ci) => ci < 2 && col.forEach((y) => L[ci + 1].forEach((y2) => edges.push([40 + ci * 80, y, 120 + ci * 80, y2]))));
    return (
      <div className="sc sc-ai" aria-hidden>
        <svg viewBox="0 0 240 150" className="sc-net">
          {edges.map(([a, b, c, d], i) => <line key={i} x1={a} y1={b} x2={c} y2={d} style={{ animationDelay: `${(i % 7) * 0.35}s` }} />)}
          {nodes.map((n, i) => <circle key={i} cx={n.x} cy={n.y} r="5" style={{ animationDelay: `${(i % 5) * 0.4}s` }} />)}
        </svg>
        <div className="sc-frame f1" /><div className="sc-frame f2" /><div className="sc-frame f3" />
      </div>
    );
  }
  return (
    <div className="sc sc-super" aria-hidden>
      <div className="sc-core" />
      <div className="sc-ring r1" /><div className="sc-ring r2" /><div className="sc-ring r3" />
      {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="sc-node" style={{ "--a": `${i * 60}deg` } as CSSProperties}><i /></div>)}
    </div>
  );
}

export default function Gateway() {
  const { workspace, me } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const mouse = useRef({ x: 0.5, y: 0.5 });
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [hover, setHover] = useState<string | null>(null);
  const [entering, setEntering] = useState<Universe | null>(null);
  const [origin, setOrigin] = useState({ x: 50, y: 50 });
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [exports, setExports] = useState<(ExportRec & { project_name: string })[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [caps, setCaps] = useState<{ id: string; label: string; ready: boolean }[]>([]);

  useEffect(() => {
    if (!workspace) return;
    const load = () => {
      api<Project[]>(`/workspaces/${workspace.id}/projects`).then(setProjects).catch(() => setProjects([]));
      api<any[]>(`/workspaces/${workspace.id}/exports`).then(setExports).catch(() => {});
      api<Job[]>(`/workspaces/${workspace.id}/jobs`).then(setJobs).catch(() => {});
    };
    load(); api<any[]>("/ai/capabilities").then(setCaps).catch(() => {});
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [workspace]);

  useEffect(() => {
    if (reducedMotion()) return;
    let raf = 0;
    const mv = (e: PointerEvent) => {
      mouse.current = { x: e.clientX / innerWidth, y: e.clientY / innerHeight };
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setTilt({ x: (mouse.current.y - 0.5) * -6, y: (mouse.current.x - 0.5) * 8 }));
    };
    addEventListener("pointermove", mv);
    return () => { removeEventListener("pointermove", mv); cancelAnimationFrame(raf); };
  }, []);

  function enter(u: Universe, el: HTMLElement | null) {
    if (entering) return;
    if (u.locked) { toast(`${u.title.replace(" UNIVERSE", " Universe").replace("SUPER", "Super")} is locked for now — it opens in a later release.`); return; }
    if (reducedMotion()) { nav(u.route); return; }
    const r = el?.getBoundingClientRect();
    if (r) setOrigin({ x: ((r.left + r.width / 2) / innerWidth) * 100, y: ((r.top + r.height / 2) / innerHeight) * 100 });
    setEntering(u);
    setTimeout(() => nav(u.route), 900);
  }

  const active = projects?.[0];
  const running = jobs.filter((j) => j.status === "queued" || j.status === "running");
  return (
    <div className={`gateway ${entering ? "is-entering" : ""}`}>
      <Particles mouse={mouse} />
      <div className="gw-glow" aria-hidden />
      <GlobalBar sub="UNIVERSE GATEWAY" />
      <main className="gw-main">
        <div className="gw-head">
          <h1>Choose your universe{me ? `, ${me.user.display_name.split(" ")[0]}` : ""}</h1>
          <p className="muted">Each universe is its own workspace. Your projects, media and jobs travel with you.</p>
        </div>
        <div className="gw-stage" style={{ transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)` }}>
          {UNIVERSES.map((u, i) => {
            const state = entering ? (entering.id === u.id ? "chosen" : "faded") : hover ? (hover === u.id ? "focus" : "dim") : "";
            return (
              <article key={u.id} className={`portal ${u.hue} ${state} ${u.locked ? "locked" : ""}`} aria-disabled={u.locked || undefined} style={{ "--c1": u.c1, "--c2": u.c2, "--c3": u.c3, "--d": `${i * -2.1}s` } as CSSProperties}
                onPointerEnter={() => setHover(u.id)} onPointerLeave={() => setHover(null)}
                onClick={(e) => enter(u, e.currentTarget)}>{/* whole portal is the click target: 3D hit-testing can miss small buttons */}
                <div className="portal-float">
                  <div className="portal-ring" aria-hidden /><div className="portal-ring two" aria-hidden />
                  <div className="portal-body">
                    <Scene u={u} />
                    <div className="portal-text">
                      <h2>{u.title}</h2>
                      <div className="portal-sub">{u.subtitle}</div>
                      <p>{u.description}</p>
                      {u.locked ? <span className="badge soon"><Lock size={11} /> Locked — opens in a later release</span>
                        : u.id === "editor" ? <span className="badge ok">Live</span> : <span className="badge soon">Early access — tools grow every release</span>}
                    </div>
                    <button type="button" className="portal-cta" onFocus={() => setHover(u.id)} onBlur={() => setHover(null)} aria-label={u.locked ? `${u.title} is locked` : `${u.cta}: ${u.subtitle}`}>
                      {u.locked ? <><Lock size={16} />LOCKED</> : <>{u.cta}<ArrowRight size={17} /></>}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        <section className="gw-dock" aria-label="Your work">
          <div className="card gw-card continue">
            <div className="gw-card-h">Continue working</div>
            {projects === null ? <div className="skeleton" style={{ height: 70 }} /> : active ? (
              <Link to={`/edit/${active.id}`} className="gw-continue"><span className="gw-cicon"><Play size={18} /></span>
                <span><b>{active.name}</b><br /><span className="dim" style={{ fontSize: 12 }}>Editor Universe · edited {timeAgo(active.updated_at)}</span></span></Link>
            ) : <div className="dim" style={{ fontSize: 13 }}>No projects yet — enter the Editor Universe to start one.</div>}
          </div>
          <div className="card gw-card">
            <div className="gw-card-h">Recent projects <Link to="/editor/projects" className="dim" style={{ marginLeft: "auto", fontSize: 12 }}>All</Link></div>
            {(projects ?? []).slice(0, 4).map((p) => <Link key={p.id} to={`/edit/${p.id}`} className="gw-row"><Film size={13} /><span className="grow ellipsis">{p.name}</span><span className="dim">{timeAgo(p.updated_at)}</span></Link>)}
            {projects?.length === 0 && <div className="dim" style={{ fontSize: 12.5 }}>Nothing yet.</div>}
          </div>
          <div className="card gw-card">
            <div className="gw-card-h">Recent exports</div>
            {exports.length === 0 && <div className="dim" style={{ fontSize: 12.5 }}>Finished videos appear here.</div>}
            {exports.slice(0, 4).map((e) => <div key={e.id} className="gw-row"><span className="grow ellipsis">{e.project_name} · {e.settings.width}×{e.settings.height}</span>
              {e.download_url ? <a href={e.download_url} className="btn icon ghost xs" aria-label="Download export"><Download size={13} /></a> : <span className="badge">{e.job.status}</span>}</div>)}
          </div>
          <div className="card gw-card">
            <div className="gw-card-h">Processing jobs {running.length > 0 && <span className="badge info">{running.length} running</span>}</div>
            {jobs.length === 0 && <div className="dim" style={{ fontSize: 12.5 }}>No jobs yet.</div>}
            {jobs.slice(0, 4).map((j) => <div key={j.id} className="gw-row"><span className="grow ellipsis">{jobLabel(j.kind)}</span>
              {j.status === "running" ? <div className="progress" style={{ width: 60 }}><i style={{ width: `${Math.round(j.progress * 100)}%` }} /></div>
                : <span className={`badge ${j.status === "succeeded" ? "ok" : j.status === "failed" ? "err" : ""}`}>{j.status}</span>}</div>)}
          </div>
          <div className="card gw-card">
            <div className="gw-card-h"><Cpu size={14} />Model availability</div>
            <div className="gw-models">{caps.filter((c) => c.ready).map((c) => <span key={c.id} title={c.label} className="ok"><CheckCircle2 size={11} />{c.label.split(" (")[0]}</span>)}</div>
          </div>
          <Link to="/library" className="card gw-card gw-lib"><b>Shared asset library</b><span className="dim" style={{ fontSize: 12 }}>All media across projects</span><ArrowRight size={16} /></Link>
        </section>
      </main>
      {entering && <div className="gw-warp" style={{ "--c1": entering.c1, "--c2": entering.c2, "--ox": `${origin.x}%`, "--oy": `${origin.y}%` } as CSSProperties} aria-hidden>
        <span>{entering.title}</span></div>}
    </div>
  );
}
