import { CSSProperties, ReactNode, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Blend, Brain, Captions, ChevronRight, CircleCheck, Clapperboard, Clock, Eye, Film, Lock, Maximize, Mic, Orbit, Play, Scissors, SlidersHorizontal, Sparkles, Type, Volume2, Wrench, Zap, ArrowRight } from "lucide-react";
import { api } from "../api";
import { useBrand } from "../App";
import GlobalBar from "../components/GlobalBar";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import "@fontsource/space-grotesk/latin-500.css";
import "@fontsource/space-grotesk/latin-700.css";
import "../cosmic.css";

/* Signed-in gateway: the founder's "Creator Universe" design. The tool counts at the bottom come from the server
   (/public/studios), so they always match what really works. Video generators are shown as locked until a provider is set up. */

type Catalogue = { total: number; live: number; planned?: number };

const FORMATS = [
  { id: "16:9", label: "16:9 Landscape", sub: "YouTube & Cinema", w: 276, h: 124 },
  { id: "9:16", label: "9:16 Shorts", sub: "TikTok, Reels & Shorts", w: 112, h: 138 },
  { id: "1:1", label: "1:1 Square", sub: "Instagram & Feed", w: 150, h: 124 },
  { id: "4:5", label: "4:5 Portrait", sub: "Social Posts", w: 134, h: 134 },
];

const FIXES = [
  { id: "trim", label: "Auto Cut Silences", desc: "Removes awkward pauses instantly", icon: Scissors },
  { id: "audio", label: "Studio Audio Balance", desc: "Crystal clear voice & music", icon: Volume2 },
  { id: "colour", label: "Cinema Color Grade", desc: "Rich vibrant contrast & tones", icon: Blend },
];

function Sky() {
  const neb = (s: CSSProperties) => <div className="cu-neb" style={s} />;
  return (
    <div className="cu-sky" aria-hidden>
      {neb({ width: 900, height: 650, left: -320, top: 40, background: "radial-gradient(circle, rgba(126,34,206,.5), rgba(126,34,206,0) 65%)" })}
      {neb({ width: 900, height: 650, right: -320, top: -20, background: "radial-gradient(circle, rgba(147,51,234,.45), rgba(147,51,234,0) 65%)", animationDelay: "-7s" })}
      {neb({ width: 1000, height: 750, left: -300, top: 1000, background: "radial-gradient(circle, rgba(88,28,135,.5), rgba(88,28,135,0) 65%)", animationDelay: "-4s" })}
      {neb({ width: 1000, height: 750, right: -300, top: 1400, background: "radial-gradient(circle, rgba(124,58,237,.4), rgba(124,58,237,0) 65%)" })}
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

/** Signed-in Universe Gateway in the founder's "Creator Universe" design. `children` = the user's own work, shown under the status bar. */
export default function CreatorUniverseView({ name, children }: { name?: string; children?: ReactNode }) {
  const go = (route: string) => route;
  const brand = useBrand();
  const [cat, setCat] = useState<Catalogue | null>(null);
  const [fixes, setFixes] = useState<Record<string, boolean>>({ trim: true, audio: true, colour: true });
  const [fmt, setFmt] = useState("9:16");

  useEffect(() => { api<Catalogue>("/public/studios").then(setCat).catch(() => setCat(null)); }, []);
  const stripWave = useMemo(() => <Wave n={60} />, []);
  const edWave = useMemo(() => <Wave n={120} />, []);

  const planned = cat?.planned ?? 0;
  const locked = cat ? cat.total - cat.live - planned : 0;

  return (
    <div className="cu" id="top">
      <Sky />

      <GlobalBar sub="CREATOR UNIVERSE" />

      <section className="cu-hero">
        <div className="cu-hero-tag">
          <Sparkles size={14} /> <span>Next-Gen Creator Studio &amp; AI Engine</span>
        </div>
        <h1>Creator <span className="cu-grad">Universe</span></h1>
        <p>{name ? `Welcome back, ${name}! ` : ""}What would you like to make today?</p>
        <div className="cu-underline" aria-hidden />

        {/* 1-click Quick Launch Chips for Beginners & 5th Graders */}
        <div className="cu-quick-bar" aria-label="Quick launch tools">
          <Link to="/editor" className="cu-qchip cu-qchip-blue">
            <Clapperboard size={14} /> <span>Cut &amp; Edit Video</span>
          </Link>
          <Link to="/ai-generator/tool/101" className="cu-qchip cu-qchip-purple">
            <Captions size={14} /> <span>Add Auto Captions</span>
          </Link>
          <Link to="/ai-generator/tool/041" className="cu-qchip cu-qchip-cyan">
            <Mic size={14} /> <span>AI Voiceover</span>
          </Link>
          <a href="#short-h" className="cu-qchip cu-qchip-pink">
            <Zap size={14} /> <span>Make 9:16 Shorts</span>
          </a>
        </div>
      </section>

      {/* 3-Step Simple Guide */}
      <section className="cu-wrap">
        <div className="cu-steps-card">
          <div className="cu-step-col">
            <span className="cu-step-badge">Step 1</span>
            <b>Pick Your Universe</b>
            <p>Editor for precision timeline cuts, or AI Generator for automated tools.</p>
          </div>
          <div className="cu-step-sep"><ChevronRight size={18} /></div>
          <div className="cu-step-col">
            <span className="cu-step-badge">Step 2</span>
            <b>Add Media or Prompt</b>
            <p>Drag in your raw footage or type your script. AI assists at every step.</p>
          </div>
          <div className="cu-step-sep"><ChevronRight size={18} /></div>
          <div className="cu-step-col">
            <span className="cu-step-badge">Step 3</span>
            <b>Export in 4K or 1080p</b>
            <p>Ready for YouTube, TikTok &amp; Instagram with zero watermarks.</p>
          </div>
        </div>
      </section>

      <section className="cu-wrap" aria-labelledby="uni-h">
        <div className="cu-title"><h2 id="uni-h">Choose your universe</h2></div>
        <div className="cu-unis">
          {/* Editor Universe */}
          <Link to={go("/editor")} className="cu-uni cuk-ed">
            <div className="cu-uni-glow" />
            <span className="cu-uni-tag ed-tag"><Film size={12} /> PRO TIMELINE IDE</span>
            <span className="cuk-top">
              <div className="cu-uni-icon-wrap ed-ic">
                <Clapperboard size={36} color="#67E8F9" strokeWidth={1.8} aria-hidden />
              </div>
              <span>
                <h3>Editor Universe</h3>
                <p>Multi-track timeline, instant auto-cut, cinema color &amp; sound balancing.</p>
              </span>
            </span>
            <span className="cu-strip" aria-hidden>
              <span className="cuk-film">{Array.from({ length: 4 }, (_, i) => <span key={i} />)}</span>
              <span className="cuk-wave">{stripWave}</span>
              <span className="cuk-ph" />
            </span>
            <span className="cuk-go">
              <Play size={14} fill="#fff" strokeWidth={0} aria-hidden />
              Open Video Editor
              <ArrowRight size={16} aria-hidden />
            </span>
          </Link>

          {/* AI Generator Universe */}
          <Link to={go("/ai-generator")} className="cu-uni cuk-ai">
            <div className="cu-uni-glow" />
            <span className="cu-uni-tag ai-tag"><Sparkles size={12} /> ALL-IN-ONE AI STUDIO</span>
            <span className="cuk-top">
              <div className="cu-uni-icon-wrap ai-ic">
                <Sparkles size={36} color="#D8B4FE" strokeWidth={1.8} aria-hidden />
              </div>
              <span>
                <h3>AI Generator Universe</h3>
                <p>AI voiceovers, auto-captions, multilingual dubbing, avatars &amp; scripts.</p>
              </span>
            </span>
            <span className="cu-aigen" aria-hidden />
            <span className="cuk-go">
              <Sparkles size={15} aria-hidden />
              Explore 100+ AI Tools
              <ArrowRight size={16} aria-hidden />
            </span>
          </Link>

          {/* Super Universe */}
          <div className="cu-uni cuk-sp">
            <div className="cu-uni-glow" />
            <span className="cu-uni-tag sp-tag"><Lock size={12} /> NEXT-GEN LAB</span>
            <span className="cuk-top">
              <div className="cu-uni-icon-wrap sp-ic">
                <Orbit size={36} color="#CFC7EA" strokeWidth={1.8} aria-hidden />
              </div>
              <span>
                <h3>Super Universe</h3>
                <p>Autonomous AI agents, deep generative video models &amp; batch automation.</p>
              </span>
            </span>
            <span className="cu-planet">
              <span className="cuk-ring" aria-hidden />
              <span className="cu-lock"><Lock size={14} aria-hidden />Locked · Coming Soon</span>
            </span>
          </div>
        </div>
      </section>

      <section className="cu-wrap" aria-labelledby="brain-h">
        <div className="cu-title">
          <h2 id="brain-h">
            <Brain size={36} color="#A78BFA" strokeWidth={1.8} aria-hidden />
            Auto Editing AI <span className="cu-grad">Brain</span>
          </h2>
        </div>
        <p className="cu-lead">
          Even a 5th grader can edit like a Hollywood pro! Click toggles to see instant enhancements.
        </p>
        <div className="cu-ed">
          <div className="cuk-crumb">
            <Play size={13} color="#A78BFA" fill="#A78BFA" aria-hidden />
            <span style={{ color: "#fff" }}>{brand}</span>
            <ChevronRight size={13} aria-hidden />
            <span>Interactive AI Brain Preview</span>
          </div>
          <nav className="cuk-menu" aria-label="Editor sections (preview)">
            <span className="cuk-on"><Film size={17} aria-hidden />Media</span>
            <span><Scissors size={17} aria-hidden />Cut Silences</span>
            <span><SlidersHorizontal size={17} aria-hidden />Audio Magic</span>
            <span><Blend size={17} aria-hidden />Color Grade</span>
            <span><Type size={17} aria-hidden />Titles</span>
            <span><Captions size={17} aria-hidden />Subtitles</span>
          </nav>
          <div className="cuk-main">
            <div className="cu-video" role="img" aria-label="Video preview of a skateboarder">
              <span className="cuk-bar">
                <Play size={14} fill="#fff" strokeWidth={0} aria-hidden />
                0:00 / 0:30
                <span className="cuk-tag-active">AI Enhancements: Active</span>
                <Maximize size={14} style={{ marginLeft: "auto" }} aria-hidden />
              </span>
            </div>
            <div className="cu-fix">
              <div className="cu-fix-title">1-Click Smart Enhancements</div>
              {FIXES.map(({ id, label, desc, icon: Icon }) => (
                <label key={id} className="cu-fix-row">
                  <input
                    type="checkbox"
                    checked={fixes[id]}
                    onChange={() => setFixes({ ...fixes, [id]: !fixes[id] })}
                  />
                  <Icon size={18} aria-hidden />
                  <div className="cu-fix-text">
                    <b>{label}</b>
                    <small>{desc}</small>
                  </div>
                </label>
              ))}
              <Link to="/editor" className="cu-review">
                <Eye size={18} aria-hidden />
                Launch Live Editor
              </Link>
            </div>
          </div>
          <div className="cu-tl" aria-hidden>
            <div className="cuk-ruler">
              {["0:00", "0:05", "0:10", "0:15", "0:20", "0:25", "0:30"].map((t) => <span key={t}>{t}</span>)}
            </div>
            <span className="cuk-ic" title="Video Track"><Film size={16} /></span>
            <div className="cuk-lane">
              <span className="cuk-ph" />
              <div className="cuk-film">{Array.from({ length: 6 }, (_, i) => <span key={i} />)}</div>
              {edWave}
            </div>
            <span className="cuk-ic" title="Audio Track"><Volume2 size={16} /></span>
          </div>
        </div>
      </section>

      <section className="cu-wrap" aria-labelledby="short-h">
        <div className="cu-title" style={{ marginTop: 34 }}>
          <h2 id="short-h">
            <Zap size={34} color="#C4B5FD" fill="#8B5CF6" aria-hidden />
            Make a Short or Reel
          </h2>
        </div>
        <p className="cu-lead">Turn one video into multiple formats, ready for YouTube, TikTok and Instagram.</p>
        <div className="cu-shorts" role="radiogroup" aria-label="Video format">
          {FORMATS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={fmt === f.id}
              className={`cu-fmt${fmt === f.id ? " cuk-on" : ""}`}
              onClick={() => setFmt(f.id)}
            >
              <span className="cuk-pic" style={{ width: f.w, height: f.h }} aria-hidden />
              <span className="cuk-lbl">
                <b>{f.label}</b>
                <small>{f.sub}</small>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="cu-wrap" aria-labelledby="gen-h">
        <div className="cu-title" style={{ marginTop: 34 }}><h2 id="gen-h">Special Video Generators</h2></div>
        <div className="cu-locked">
          <span><Lock size={15} aria-hidden />Enterprise Engine · Provider Setup Required</span>
        </div>
        <div className="cu-gens">
          <Link to="/ai-generator" className="cu-gen t"><b>Text to Video</b></Link>
          <Link to="/ai-generator" className="cu-gen i"><b>Image to Video</b></Link>
          <Link to="/ai-generator" className="cu-gen a"><b>Product Ad Creator</b></Link>
        </div>
        {cat && (
          <div className="cu-status" aria-label="AI tool status">
            <span><Wrench size={20} aria-hidden /><CircleCheck size={20} color="#22C55E" aria-hidden />{cat.live} available</span>
            <span><Lock size={19} color="#C4B5FD" aria-hidden />{locked} locked</span>
            {planned > 0 && <span><Clock size={19} aria-hidden />{planned} planned</span>}
          </div>
        )}
      </section>
      {children}
    </div>
  );
}
