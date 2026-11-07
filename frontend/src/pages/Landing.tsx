import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  Zap, Search, ArrowUpRight, ArrowRight, ChevronDown, Menu, X, Film, Languages, Scissors, ImageIcon,
  Users, IndianRupee, Clapperboard, AudioLines, Wand2, PenLine, Brain, LineChart, Layers, Video, Globe, Workflow, Sparkles,
} from "lucide-react";
import { api } from "../api";
import { useAuth, useBrand } from "../App";
import "@fontsource/space-grotesk/latin-500.css";
import "@fontsource/space-grotesk/latin-600.css";
import "@fontsource/space-grotesk/latin-700.css";
import "../landing.css";
import HeroScene, { useReveal, useTilt } from "./LandingHero";

/* Signed-out landing ("dashboard before login"). Signed-in visitors go straight to the app at /universes.
   Every number on this page comes from the server's tool registry (/public/studios): nothing here is a placeholder. */

type Studio = { id: string; code: string; name: string; tagline: string; total: number; live: number; live_tools: string[] };
type Catalogue = { studios: Studio[]; total: number; live: number };

const ICONS: Record<string, typeof Film> = {
  video: Video, image: ImageIcon, transform: Wand2, animation: Sparkles, audio: AudioLines, writing: PenLine,
  content: Brain, creator: LineChart, imageedit: Layers, videointel: Clapperboard, localize: Globe, automation: Workflow,
};

// Where a signed-out click should land after sign-in.
const go = (route: string) => `/signin?next=${encodeURIComponent(route)}`;
const studioRoute = (id: string) => `/ai-generator/studio/${id}`;

const EDITOR_MENU = [
  { t: "Multitrack timeline", d: "Trim, split, ripple, snapping, keyframes" },
  { t: "Colour grading", d: "Wheels, curves, .cube LUTs, live scopes" },
  { t: "Titles in 10 scripts", d: "Hindi, Tamil, Telugu, Bengali and more" },
  { t: "Captions & dubbing", d: "Whisper captions, translation, Hindi voices" },
  { t: "Shorts & reframe", d: "Highlight finder, batch Shorts, face-centred crop" },
  { t: "Cloud export", d: "Keeps rendering after you close the tab" },
];

const SHOWCASE = [
  { tag: "Editor universe", t: "Edit on a real timeline", d: "Multitrack editing, colour, keyframes and transitions in the browser. Exports render in the cloud.", icon: Film, tone: "olive", route: "/editor" },
  { tag: "Localization", t: "Speak every language", d: "Automatic captions, translation and Hindi dubbing on free engines that run on our servers.", icon: Languages, tone: "plum", route: studioRoute("localize") },
  { tag: "Shorts", t: "One video, many Shorts", d: "Find the highlights, cut a batch of Shorts and keep faces centred when you reframe to 9:16.", icon: Scissors, tone: "teal", route: "/editor" },
  { tag: "Thumbnails", t: "Find the right frame", d: "Snapshot any frame and design a thumbnail with titles in Indian scripts.", icon: ImageIcon, tone: "olive", route: "/editor" },
  { tag: "Teams", t: "Work together", d: "Workspaces with roles, so editors, reviewers and owners each see the right controls.", icon: Users, tone: "plum", route: "/settings" },
  { tag: "Pricing", t: "Start free, pay by UPI", d: "The free plan covers the editor and local AI tools. Upgrade with a UPI or PayPal payment, no card needed.", icon: IndianRupee, tone: "teal", route: "/settings" },
];

function useCatalogue() {
  const [cat, setCat] = useState<Catalogue | null>(null);
  const [failed, setFailed] = useState(false);
  // Show only what works: studios with no live tool yet are left out (they appear once their service is connected).
  useEffect(() => { api<Catalogue>("/public/studios").then((c) => setCat({ ...c, studios: c.studios.filter((s) => s.live > 0) })).catch(() => setFailed(true)); }, []);
  return { cat, failed };
}

function Mark() {
  return <span className="lp-mark" aria-hidden><Zap size={17} strokeWidth={2.6} /></span>;
}

function LpBrand() {
  const brand = useBrand();
  const words = brand.split(" ");
  return (
    <a href="#top" className="lp-brand" aria-label={`${brand} home`}>
      <Mark /><span>{words.slice(0, -1).join(" ")} <em>{words[words.length - 1]}</em></span>
    </a>
  );
}

function Dropdown({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const hoverAt = useRef(0); // a click right after hover-open keeps the menu open instead of toggling it shut
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);
  return (
    <div className="lp-dd" ref={ref} onMouseEnter={() => { hoverAt.current = Date.now(); setOpen(true); }} onMouseLeave={() => setOpen(false)}>
      <button type="button" className="lp-navlink" aria-expanded={open} aria-haspopup="true"
        onClick={() => setOpen((o) => (Date.now() - hoverAt.current < 400 ? true : !o))}>
        {label}<ChevronDown size={13} />
      </button>
      {open && <div className={`lp-dd-panel${wide ? " wide" : ""}`} onClick={() => setOpen(false)}>{children}</div>}
    </div>
  );
}

function liveLabel(s: Studio) {
  return `${s.live} tool${s.live === 1 ? "" : "s"} live`;
}

export default function Landing() {
  const { me, loading } = useAuth();
  const brand = useBrand();
  const { cat, failed } = useCatalogue();
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [menu, setMenu] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const page = useRef<HTMLDivElement>(null);
  const ready = !loading && !me;
  useTilt(page, ".lp-card", ready);
  useReveal(page, ready);

  useEffect(() => { if (searching) searchRef.current?.focus(); }, [searching]);

  const rows = useMemo(() => {
    const all = cat?.studios ?? [];
    const n = q.trim().toLowerCase();
    if (!n) return all;
    return all.filter((s) => [s.name, s.tagline, ...s.live_tools].some((x) => x.toLowerCase().includes(n)));
  }, [cat, q]);
  const editorMatches = !q.trim() || "editor timeline colour color titles captions export shorts keyframes".includes(q.trim().toLowerCase());

  if (loading) return <div className="lp" />;
  if (me) return <Navigate to="/universes" replace />;

  const year = new Date().getFullYear();
  // Footer links only to studios that work today, in a fixed order.
  const liveStudios = (ids: string[]) => ids.map((id) => cat?.studios.find((s) => s.id === id)).filter((s): s is Studio => !!s).slice(0, 3);
  const workspaces = (cat?.studios.length ?? 12) + 1;

  return (
    <div className="lp" id="top" ref={page}>
      <header className="lp-nav">
        <div className="lp-nav-in">
          <LpBrand />
          <nav className={`lp-links${menu ? " open" : ""}`} aria-label="Site">
            <a className="lp-navlink active" href="#top" onClick={() => setMenu(false)}>Explore</a>
            <Dropdown label="Editor">
              {EDITOR_MENU.map((m) => (
                <Link key={m.t} to={go("/editor")} className="lp-dd-item"><b>{m.t}</b><span>{m.d}</span></Link>
              ))}
            </Dropdown>
            <Dropdown label="AI studios" wide>
              {(cat?.studios ?? []).map((s) => {
                const I = ICONS[s.id] ?? Sparkles;
                return (
                  <Link key={s.id} to={go(studioRoute(s.id))} className="lp-dd-item row">
                    <I size={16} /><div><b>{s.name.replace(/^AI /, "")}</b><span>{liveLabel(s)}</span></div>
                  </Link>
                );
              })}
              {!cat && <span className="lp-dd-empty">{failed ? "Studios could not be loaded." : "Loading studios…"}</span>}
            </Dropdown>
            <a className="lp-navlink" href="#workspaces" onClick={() => setMenu(false)}>Workspaces</a>
            <a className="lp-navlink" href="#directory" onClick={() => setMenu(false)}>All tools</a>
            <a className="lp-navlink" href="#status" onClick={() => setMenu(false)}>What's live</a>
          </nav>
          <div className="lp-nav-right">
            <button type="button" className="lp-icon" aria-label="Search tools" onClick={() => { setSearching(true); document.getElementById("directory")?.scrollIntoView({ behavior: "smooth" }); }}><Search size={17} /></button>
            <Link to="/signin" className="lp-signin">Sign in</Link>
            <Link to="/signup" className="lp-btn sm">Open studio <ArrowUpRight size={14} /></Link>
            <button type="button" className="lp-icon lp-burger" aria-label={menu ? "Close menu" : "Open menu"} aria-expanded={menu} onClick={() => setMenu((m) => !m)}>{menu ? <X size={18} /> : <Menu size={18} />}</button>
          </div>
        </div>
      </header>

      <main>
        <section className="lp-hero">
          <div className="lp-hero-copy">
          <p className="lp-eyebrow"><span className="lp-pulse" aria-hidden />For Indian creators · free to start</p>
          <h1>Make one video.<br /><span>Reach every language.</span></h1>
          <p className="lp-lead">Edit in your browser, caption automatically, dub into Hindi and turn long videos into Shorts. One workspace for the editor and {cat ? cat.live : "dozens of"} working AI tools.</p>
          <div className="lp-hero-cta">
            <Link to="/signup" className="lp-btn lg"><Zap size={17} /> Open your creative workspace</Link>
            <a href="#status" className="lp-btn ghost lg">See what's live</a>
          </div>
          <dl className="lp-stats">
            <div><dt>AI tools live</dt><dd>{cat ? cat.live : "—"}</dd></div>
            <div><dt>Workspaces</dt><dd>{cat ? cat.studios.length + 1 : "—"}</dd></div>
            <div><dt>Title scripts</dt><dd>10</dd></div>
            <div><dt>Pay with</dt><dd>UPI</dd></div>
          </dl>
          </div>
          <HeroScene />
        </section>

        <section className="lp-section lp-reveal" id="workspaces" aria-labelledby="ws-h">
          <div className="lp-head">
            <div><p className="lp-eyebrow">Start where you are</p><h2 id="ws-h">Everything a channel needs, in one place.</h2></div>
          </div>
          <div className="lp-cards">
            {SHOWCASE.map(({ tag, t, d, icon: I, tone, route }) => (
              <Link key={t} to={go(route)} className={`lp-card ${tone}`}>
                <div className="lp-card-art"><I size={30} strokeWidth={1.5} /><span>{tag}</span><ArrowUpRight className="lp-card-corner" size={16} /></div>
                <div className="lp-card-body"><h3>{t}</h3><p>{d}</p><span className="lp-more">Explore workspace <ArrowUpRight size={13} /></span></div>
              </Link>
            ))}
          </div>
        </section>

        <section className="lp-section lp-reveal" id="directory" aria-labelledby="dir-h">
          <div className="lp-head">
            <div><p className="lp-eyebrow">The complete creative directory</p><h2 id="dir-h">All {workspaces} workspaces. All in reach.</h2></div>
            <p className="lp-note">Every workspace listed here works today. More appear automatically as new services are connected.</p>
          </div>
          {searching && (
            <div className="lp-search">
              <Search size={16} />
              <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search workspaces and live tools (try “dub” or “thumbnail”)" aria-label="Search workspaces" />
              <button type="button" aria-label="Close search" onClick={() => { setQ(""); setSearching(false); }}><X size={16} /></button>
            </div>
          )}
          <div className="lp-dir">
            {editorMatches && (
              <Link to={go("/editor")} className="lp-dir-row">
                <span className="lp-num">00</span>
                <div><b>Editor</b><span className="ok">Live · timeline, colour, titles, captions, export</span></div>
                <ArrowUpRight size={15} />
              </Link>
            )}
            {rows.map((s, i) => (
              <Link key={s.id} to={go(studioRoute(s.id))} className="lp-dir-row">
                <span className="lp-num">{String((cat?.studios.indexOf(s) ?? i) + 1).padStart(2, "0")}</span>
                <div><b>{s.name.replace(/^AI /, "")}</b><span className={s.live ? "ok" : ""}>{liveLabel(s)} · {s.tagline}</span></div>
                <ArrowUpRight size={15} />
              </Link>
            ))}
            {!cat && !failed && Array.from({ length: 6 }, (_, i) => <div key={i} className="lp-dir-row skel" aria-hidden />)}
            {failed && <p className="lp-note">The studio list could not be loaded. Sign in to see every tool.</p>}
            {cat && q && !rows.length && !editorMatches && <p className="lp-note">Nothing matches “{q}”.</p>}
          </div>
        </section>

        <section className="lp-section lp-reveal" id="status" aria-labelledby="st-h">
          <div className="lp-status">
            <h2 id="st-h">What's live, honestly</h2>
            <p><b>Live:</b> accounts (email and Google), workspaces and teams, cloud uploads, the multitrack editor with titles, speed, crop, colour grading, curves, LUTs, keyframes and transitions, autosave with history, cloud MP4 export, AI voice, captions, translation, dubbing, background removal, stabilisation, object removal for marked areas (logos, watermarks, text), highlights and Shorts{cat ? `, and ${cat.live} AI tools` : ""}.</p>
            <p><b>Not yet:</b> lip sync, removing moving objects, motion tracking and hosted video/image generation until those services are connected. We mark a tool live only when it really works.</p>
          </div>
        </section>

        <section className="lp-section lp-reveal">
          <div className="lp-band">
            <div><h2>Your idea. Your next step.</h2><p>Start with a simple workspace. Open more controls as your project grows.</p></div>
            <Link to="/signup" className="lp-btn">Get started <ArrowRight size={15} /></Link>
          </div>
        </section>

        <section className="lp-final lp-reveal">
          <div className="lp-sparks" aria-hidden>{Array.from({ length: 14 }, (_, i) => <i key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i * 0.7) % 6}s`, animationDuration: `${7 + (i % 5)}s` }} />)}</div>
          <p className="lp-eyebrow">Start today</p>
          <h2>Build your creator empire<br /><span>with AI.</span></h2>
          <p>Start with the free tools that run on our servers. Add premium AI when you're ready.</p>
          <Link to="/signup" className="lp-btn xl"><Zap size={18} /> Open your creative workspace</Link>
        </section>
      </main>

      <footer className="lp-foot">
        <div className="lp-foot-in">
          <div className="lp-foot-brand">
            <LpBrand />
            <p>Cloud video editor and AI studio for Indian creators. Make one video, reach every language.</p>
          </div>
          <div><h4>Create</h4>
            <Link to={go("/editor")}>Video editor</Link>
            {liveStudios(["audio", "animation", "imageedit", "transform"]).map((s) => <Link key={s.id} to={go(studioRoute(s.id))}>{s.name.replace(/^AI /, "")}</Link>)}
          </div>
          <div><h4>Grow</h4>
            {liveStudios(["localize", "creator", "videointel", "content"]).map((s) => <Link key={s.id} to={go(studioRoute(s.id))}>{s.name.replace(/^AI /, "")}</Link>)}
          </div>
          <div><h4>Workspace</h4>
            <a href="#directory">All {workspaces} workspaces</a>
            <Link to={go("/editor/projects")}>Projects</Link>
            <Link to={go("/settings")}>Team &amp; plans</Link>
          </div>
          <div><h4>Resources</h4>
            <a href="#status">What's live</a>
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
          </div>
        </div>
        <div className="lp-foot-bar">
          <span>© {year} {brand}. All rights reserved.</span>
          <span className="lp-live"><i className={cat ? "on" : failed ? "off" : ""} />
            {cat ? `Servers online · ${cat.live} AI tools live` : failed ? "Status unavailable" : "Checking status…"}</span>
        </div>
      </footer>
    </div>
  );
}
