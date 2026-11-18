import { CSSProperties, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Blend, Brain, Captions, ChevronRight, CircleCheck, Clapperboard, Clock, Eye, Film, Lock, Maximize, Orbit, Play, Scissors, SlidersHorizontal, Sparkles, Type, User, Volume2, Wrench, Zap } from "lucide-react";
import { api } from "../api";
import { useAuth, useBrand } from "../App";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import "@fontsource/space-grotesk/latin-500.css";
import "@fontsource/space-grotesk/latin-700.css";
import "../cosmic.css";

/* Signed-out home: the founder's "Creator Universe" design. The tool counts at the bottom come from the server
   (/public/studios), so they always match what really works. Video generators are shown as locked until a provider is set up. */

type Catalogue = { total: number; live: number; planned?: number };

const go = (route: string) => `/signin?next=${encodeURIComponent(route)}`;

const FORMATS = [
  { id: "16:9", label: "16:9 Landscape", w: 276, h: 124 },
  { id: "9:16", label: "9:16 Shorts", w: 112, h: 138 },
  { id: "1:1", label: "1:1 Square", w: 150, h: 124 },
  { id: "4:5", label: "4:5 Portrait", w: 134, h: 134 },
];

const FIXES = [
  { id: "trim", label: "Trim silences", icon: Scissors },
  { id: "audio", label: "Balance audio", icon: Volume2 },
  { id: "colour", label: "Correct colour", icon: Blend },
];

function Sky() {
  const neb = (s: CSSProperties) => <div className="cu-neb" style={s} />;
  return (
    <div className="cu-sky" aria-hidden>
      {neb({ width: 800, height: 600, left: -320, top: 60, background: "radial-gradient(circle, rgba(126,34,206,.45), rgba(126,34,206,0) 65%)" })}
      {neb({ width: 800, height: 600, right: -320, top: 0, background: "radial-gradient(circle, rgba(147,51,234,.4), rgba(147,51,234,0) 65%)", animationDelay: "-7s" })}
      {neb({ width: 900, height: 700, left: -300, top: 1100, background: "radial-gradient(circle, rgba(88,28,135,.45), rgba(88,28,135,0) 65%)", animationDelay: "-4s" })}
      {neb({ width: 900, height: 700, right: -300, top: 1500, background: "radial-gradient(circle, rgba(124,58,237,.35), rgba(124,58,237,0) 65%)" })}
      <div className="cu-stars" /><div className="cu-stars2" />
      <div className="cu-arc" />
    </div>
  );
}

const Wave = ({ n }: { n: number }) => (
  <div className="cu-wave">
    {Array.from({ length: n }, (_, i) => <i key={i} style={{ height: `${30 + ((i * 37) % 70)}%`, animationDelay: `-${((i * 0.11) % 1.2).toFixed(2)}s` }} />)}
  </div>
);

export default function CosmicLanding() {
  const { me, loading } = useAuth();
  const brand = useBrand();
  const [cat, setCat] = useState<Catalogue | null>(null);
  const [fixes, setFixes] = useState<Record<string, boolean>>({ trim: true, audio: true, colour: true });
  const [fmt, setFmt] = useState("9:16");

  useEffect(() => { api<Catalogue>("/public/studios").then(setCat).catch(() => setCat(null)); }, []);
  const stripWave = useMemo(() => <Wave n={60} />, []);
  const edWave = useMemo(() => <Wave n={120} />, []);

  if (loading) return <div className="cu" />;
  if (me) return <Navigate to="/universes" replace />;

  const planned = cat?.planned ?? 0;
  const locked = cat ? cat.total - cat.live - planned : 0;

  return (
    <div className="cu" id="top">
      <Sky />

      <header className="cu-nav">
        <a href="#top" className="cu-brand" aria-label={`${brand} home`}>
          <Play size={34} color="#A78BFA" strokeWidth={2.2} aria-hidden />
          <span><b className="cu-disp">{brand}</b><small>by YouTube Buddy X</small></span>
        </a>
        <Link to="/signin" className="cu-signin"><User size={17} aria-hidden />Sign in</Link>
      </header>

      <section className="cu-hero">
        <h1>Creator <span className="cu-grad">Universe</span></h1>
        <p>Edit a video, make a Short, or find the <b>AI tool</b> you need.</p>
        <div className="cu-underline" aria-hidden />
      </section>

      <section className="cu-wrap" aria-labelledby="uni-h">
        <div className="cu-title"><h2 id="uni-h">Choose your universe</h2></div>
        <div className="cu-unis">
          <Link to={go("/editor")} className="cu-uni cuk-ed">
            <span className="cuk-top"><Clapperboard size={42} color="#67E8F9" strokeWidth={1.6} aria-hidden /><span><h3>Editor Universe</h3><p>A powerful, easy-to-use video editor for creators.</p></span></span>
            <span className="cu-strip" aria-hidden><span className="cuk-film">{Array.from({ length: 4 }, (_, i) => <span key={i} />)}</span><span className="cuk-wave">{stripWave}</span><span className="cuk-ph" /></span>
            <span className="cuk-go"><Play size={15} fill="#fff" strokeWidth={0} aria-hidden />Start editing<ChevronRight size={17} aria-hidden /></span>
          </Link>
          <Link to={go("/ai-generator")} className="cu-uni cuk-ai">
            <span className="cuk-top"><Sparkles size={42} color="#D8B4FE" strokeWidth={1.6} aria-hidden /><span><h3>AI Generator Universe</h3><p>Create videos from text, images, and ideas with AI.</p></span></span>
            <span className="cu-aigen" aria-hidden />
            <span className="cuk-go"><Sparkles size={16} aria-hidden />Explore tools<ChevronRight size={17} aria-hidden /></span>
          </Link>
          <div className="cu-uni cuk-sp">
            <span className="cuk-top"><Orbit size={42} color="#CFC7EA" strokeWidth={1.6} aria-hidden /><span><h3>Super Universe</h3><p>Advanced creative tools and next-gen capabilities.</p></span></span>
            <span className="cu-planet"><span className="cuk-ring" aria-hidden /><span className="cu-lock"><Lock size={15} aria-hidden />Locked</span></span>
          </div>
        </div>
      </section>

      <section className="cu-wrap" aria-labelledby="brain-h">
        <div className="cu-title"><h2 id="brain-h"><Brain size={40} color="#A78BFA" strokeWidth={1.6} aria-hidden />Auto Editing AI <span className="cu-grad">Brain</span></h2></div>
        <p className="cu-lead">Automatically clean up, balance and enhance your video so it looks and sounds great, with just a few clicks.</p>
        <div className="cu-ed">
          <div className="cuk-crumb"><Play size={13} color="#A78BFA" fill="#A78BFA" aria-hidden /><span style={{ color: "#fff" }}>{brand}</span><ChevronRight size={13} aria-hidden />Editor</div>
          <nav className="cuk-menu" aria-label="Editor sections (preview)">
            <span className="cuk-on"><Film size={17} aria-hidden />Media</span>
            <span><Scissors size={17} aria-hidden />Cut</span>
            <span><SlidersHorizontal size={17} aria-hidden />Audio</span>
            <span><Blend size={17} aria-hidden />Colour</span>
            <span><Type size={17} aria-hidden />Text</span>
            <span><Captions size={17} aria-hidden />Captions</span>
          </nav>
          <div className="cuk-main">
            <div className="cu-video" role="img" aria-label="Video preview of a skateboarder">
              <span className="cuk-bar"><Play size={14} fill="#fff" strokeWidth={0} aria-hidden />0:00 / 0:30<Maximize size={14} style={{ marginLeft: "auto" }} aria-hidden /></span>
            </div>
            <div className="cu-fix">
              {FIXES.map(({ id, label, icon: Icon }) => (
                <label key={id}><input type="checkbox" checked={fixes[id]} onChange={() => setFixes({ ...fixes, [id]: !fixes[id] })} /><Icon size={20} aria-hidden />{label}</label>
              ))}
              <Link to="/signup" className="cu-review"><Eye size={19} aria-hidden />Review changes</Link>
            </div>
          </div>
          <div className="cu-tl" aria-hidden>
            <div className="cuk-ruler">{["0:00", "0:05", "0:10", "0:15", "0:20", "0:25", "0:30"].map((t) => <span key={t}>{t}</span>)}</div>
            <span className="cuk-ic"><Film size={16} /></span>
            <div className="cuk-lane"><span className="cuk-ph" /><div className="cuk-film">{Array.from({ length: 6 }, (_, i) => <span key={i} />)}</div>{edWave}</div>
            <span className="cuk-ic"><Volume2 size={16} /></span>
          </div>
        </div>
      </section>

      <section className="cu-wrap" aria-labelledby="short-h">
        <div className="cu-title" style={{ marginTop: 34 }}><h2 id="short-h"><Zap size={36} color="#C4B5FD" fill="#8B5CF6" aria-hidden />Make a Short</h2></div>
        <p className="cu-lead">Turn one video into multiple formats, ready for every platform.</p>
        <div className="cu-shorts" role="radiogroup" aria-label="Video format">
          {FORMATS.map((f) => (
            <button key={f.id} type="button" role="radio" aria-checked={fmt === f.id} className={`cu-fmt${fmt === f.id ? " cuk-on" : ""}`} onClick={() => setFmt(f.id)}>
              <span className="cuk-pic" style={{ width: f.w, height: f.h }} aria-hidden />
              <span className="cuk-lbl">{f.label}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="cu-wrap" aria-labelledby="gen-h">
        <div className="cu-title" style={{ marginTop: 34 }}><h2 id="gen-h">Special Video Generators</h2></div>
        <div className="cu-locked"><span><Lock size={15} aria-hidden />Locked · provider setup required</span></div>
        <div className="cu-gens">
          <div className="cu-gen t"><b>Text to Video</b></div>
          <div className="cu-gen i"><b>Image to Video</b></div>
          <div className="cu-gen a"><b>Product Ad</b></div>
        </div>
        {cat && (
          <div className="cu-status" aria-label="AI tool status">
            <span><Wrench size={20} aria-hidden /><CircleCheck size={20} color="#22C55E" aria-hidden />{cat.live} available</span>
            <span><Lock size={19} color="#C4B5FD" aria-hidden />{locked} locked</span>
            {planned > 0 && <span><Clock size={19} aria-hidden />{planned} planned</span>}
          </div>
        )}
      </section>

      <footer className="cu-foot">© {new Date().getFullYear()} {brand}<Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link><Link to="/signup">Create free account</Link></footer>
    </div>
  );
}
