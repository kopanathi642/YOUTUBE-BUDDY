import { CSSProperties, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  Play,
  Facebook, Instagram, X as XIcon, Youtube,
  Zap, Layers, ArrowRight, CheckCircle2,
} from "lucide-react";
import { api } from "../api";
import { useAuth, useBrand } from "../App";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import "@fontsource/space-grotesk/latin-500.css";
import "@fontsource/space-grotesk/latin-700.css";
import "../home1.css";
import { AIChip3D, CameraLens, FilmReel3D, Globe3D, HoloMic3D, IdeWidgets, MagicWand3D, NeuralNodes, Sparks, Timeline3D } from "./home3d";

/* Signed-out home — Premium dark SaaS redesign.
   All numbers from /public/studios and /public/plans — no fake data. */

type Catalogue = { total: number; live: number };
type PublicPlan = {
  id: string;
  name: string;
  price_inr: number;
  year_price_inr: number;
  ai_credit_inr: number | null;
  blurb: string;
};

const go  = (route: string) => `/signin?next=${encodeURIComponent(route)}`;
const inr = (n: number) => "₹" + n.toLocaleString("en-IN");

const PLAN_POINTS: Record<string, string[]> = {
  free:    ["Full multitrack editor", "Captions, translation, dubbing", "Background & object removal", "1080p export with small badge"],
  creator: ["Everything in Free", "No badge on exports", "Premium AI credits monthly", "AI video, image & voice engines"],
  pro:     ["Everything in Creator", "More premium AI credits", "Priority queue for exports & AI", "Best for teams & busy channels"],
};

type Nebula = {
  w: number;
  h: number;
  l?: string | number;
  r?: string | number;
  ml?: number;
  t: number;
  bg: string;
  ad?: string;
};

const NEBULAS: Nebula[] = [
  { w:1200, h:700,  l:"50%", ml:-600, t:-300, bg:"radial-gradient(ellipse,rgba(0,240,255,.18),rgba(0,240,255,0) 65%)" },
  { w:800,  h:800,  l:-300,  t:200,   bg:"radial-gradient(circle,rgba(139,92,246,.2),rgba(139,92,246,0) 65%)", ad:"-8s" },
  { w:800,  h:800,  r:-300,  t:300,   bg:"radial-gradient(circle,rgba(0,240,255,.15),rgba(0,240,255,0) 65%)", ad:"-4s" },
  { w:900,  h:900,  l:"50%", ml:-450, t:1600, bg:"radial-gradient(circle,rgba(139,92,246,.18),rgba(139,92,246,0) 65%)", ad:"-12s" },
  { w:1000, h:1000, r:-400,  t:2800,  bg:"radial-gradient(circle,rgba(0,240,255,.12),rgba(0,240,255,0) 65%)" },
];

/* ── Background: stars + nebulas ──────────────────────────── */
function Sky() {
  return (
    <div className="ch-sky" aria-hidden>
      <div className="ch-grid-bg" />
      {/* Nebula blobs */}
      {NEBULAS.map((s, i) => (
        <div key={i} className="ch-neb" style={{
          width: s.w, height: s.h,
          left: s.l, right: s.r,
          marginLeft: s.ml,
          top: s.t,
          background: s.bg,
          animationDelay: s.ad ?? "0s",
        } as CSSProperties} />
      ))}
      <div className="ch-stars" />
      <div className="ch-stars2" />
      <div className="ch-stars3" />
    </div>
  );
}

/* ── 3D Isometric Workspace (pure CSS) ────────────────────── */
function Workspace({ live }: { live?: number }) {
  const waveNodes = useMemo(
    () => Array.from({ length: 32 }, (_, i) => ({ delay: `-${((i * 0.09) % 1.1).toFixed(2)}s` })),
    []
  );

  return (
    <div className="ch-workspace ch-rise5" aria-hidden>
      <NeuralNodes />
      <CameraLens />
      <Sparks />
      <div className="ch-ws-pill ch3-gen" style={{ border: "1px solid rgba(236,72,153,0.3)", background: "rgba(20,5,20,0.75)", color: "#f9a8d4" }}>
        <div className="ch-ws-pill-dot" style={{ background: "#ec4899", boxShadow: "0 0 8px #ec4899" }} />3D Gen · Creator
      </div>
      {/* Main frame */}
      <div className="ch-ws-frame">
        {/* Top bar */}
        <div className="ch-ws-bar">
          <div className="ch-ws-dots">
            <i style={{ background: "#F87171" }} />
            <i style={{ background: "#FBBF24" }} />
            <i style={{ background: "#34D399" }} />
          </div>
          <span className="ch-ws-title">YouTube Buddy — Project: New Story.ybs</span>
          <span className="ch-ws-badge">● LIVE</span>
        </div>

        {/* Video preview */}
        <div className="ch-ws-preview">
          <div className="ch-ws-scene-sky" />
          <div className="ch-ws-scene-glow" />
          <div className="ch-ws-scene-horizon" />
          <div className="ch-ws-scene-city" />
          {/* City windows */}
          {[
            {l:60,b:38},{l:120,b:52},{l:180,b:30},{l:240,b:45},{l:300,b:28},
            {l:360,b:35},{l:420,b:48},{l:480,b:25},{l:540,b:40},
          ].map(({l,b},i) => (
            <div key={i} className="ch-ws-window" style={{
              left: l, bottom: `${b}%`,
              animationDelay: `-${(i * 0.4).toFixed(1)}s`,
            }} />
          ))}
          {/* Play button */}
          <div className="ch-ws-play">
            <div className="ch-ws-play-tri" />
          </div>
          {/* Scan line */}
          <div className="ch-ws-scan" />
        </div>

        {/* Timeline */}
        <div className="ch-ws-timeline">
          <div className="ch-ws-tl-label">Timeline · 00:01:12 / 00:04:38</div>
          <div className="ch-tl-head" />
          <div className="ch-tl-row">
            <span style={{ flex:3, background:"linear-gradient(90deg,rgba(0,240,255,.7),rgba(0,180,200,.5))" }} />
            <span style={{ flex:5, background:"linear-gradient(90deg,rgba(139,92,246,.7),rgba(109,40,217,.5))" }} />
            <span style={{ flex:2, background:"linear-gradient(90deg,rgba(99,102,241,.6),rgba(79,70,229,.4))" }} />
            <span style={{ flex:4, background:"linear-gradient(90deg,rgba(0,240,255,.5),rgba(0,200,230,.35))" }} />
          </div>
          <div className="ch-tl-row">
            <span style={{ flex:4, background:"linear-gradient(90deg,rgba(109,40,217,.6),rgba(139,92,246,.4))" }} />
            <span style={{ flex:2 }} />
            <span style={{ flex:5, background:"linear-gradient(90deg,rgba(109,40,217,.5),rgba(79,70,229,.35))" }} />
            <span style={{ flex:3 }} />
          </div>
          <div className="ch-wave-row">
            {waveNodes.map((n, i) => (
              <i key={i} style={{ animationDelay: n.delay, opacity: 0.7 + (i % 3) * 0.1 }} />
            ))}
          </div>
          <div className="ch-tl-row" style={{ height: 14 }}>
            <span style={{ flex:2, background:"rgba(52,211,153,.5)", borderRadius:3 }} />
            <span style={{ flex:1 }} />
            <span style={{ flex:4, background:"rgba(52,211,153,.4)", borderRadius:3 }} />
            <span style={{ flex:2 }} />
            <span style={{ flex:3, background:"rgba(52,211,153,.5)", borderRadius:3 }} />
          </div>
        </div>
      </div>

      {/* Floating card: Auto-Cut */}
      <div className="ch-ws-pill" style={{
        top: 60, right: -28,
        border: "1px solid rgba(0,240,255,0.25)",
        background: "rgba(0,10,20,0.75)",
        color: "#00f0ff",
        animationDelay: "0s",
      }}>
        <div className="ch-ws-pill-dot" style={{ background:"#00f0ff", boxShadow:"0 0 8px #00f0ff" }} />
        Auto-Cut ✦
      </div>
      {/* Floating card: AI Voice */}
      <div className="ch-ws-pill" style={{
        top: 160, right: -38,
        border: "1px solid rgba(139,92,246,0.3)",
        background: "rgba(10,5,30,0.75)",
        color: "#a78bfa",
        animationDelay: "-2s",
      }}>
        <div className="ch-ws-pill-dot" style={{ background:"#a78bfa", boxShadow:"0 0 8px #a78bfa" }} />
        AI Voice 🎙
      </div>
      {/* Floating card: 3D Gen / live tools */}
      <div className="ch-ws-pill" style={{
        top: 260, right: -24,
        border: "1px solid rgba(245,158,11,0.25)",
        background: "rgba(15,10,5,0.75)",
        color: "#f59e0b",
        animationDelay: "-4s",
        fontSize: 10,
      }}>
        <div className="ch-ws-pill-dot" style={{ background:"#f59e0b", boxShadow:"0 0 8px #f59e0b" }} />
        {live != null ? `${live} Tools Live` : "Tools Live"} ⚡
      </div>

      {/* Bottom card: waveform */}
      <div className="ch-ws-card ch-ws-audio" style={{
        top: 70, left: -70,
        width: 180,
        border: "1px solid rgba(0,240,255,0.15)",
        background: "rgba(4,3,13,0.85)",
        animationDelay: "-3s",
        animation: "ch-float 6s ease-in-out -3s infinite",
      }}>
        <div className="ch-ws-card-label" style={{ color:"#00f0ff" }}>AI Audio</div>
        <div style={{ display:"flex", alignItems:"flex-end", gap:3, height:32 }}>
          {Array.from({length:16}, (_,i) => (
            <div key={i} style={{
              flex:1,
              height:`${30 + ((i * 41) % 70)}%`,
              borderRadius:2,
              background:"linear-gradient(180deg,#00f0ff,#8b5cf6)",
              transformOrigin:"bottom",
              animation:`ch-bars ${0.9 + (i%3)*0.15}s ease-in-out -${((i*0.08)%0.9).toFixed(2)}s infinite`,
            }} />
          ))}
        </div>
        <div className="ch-ws-card-sub">Auto noise removal on</div>
      </div>
    </div>
  );
}

/* ── Bento grid feature cards ─────────────────────────────── */
const BENTO = [
  {
    id:"editor", span2:true,
    icon: <Timeline3D />,
    iconBg: "linear-gradient(135deg,#00b8d4,#8b5cf6)",
    iconGlow: "0 0 24px rgba(0,184,212,0.5)",
    tag:"Unlimited", tagColor:"rgba(0,240,255,0.15)", tagText:"#00f0ff",
    h:"Universal Editor",
    p:"Professional multi-track timeline, colour wheels, live scopes, and auto-cut — your full post studio in the browser.",
    art:true,
  },
  {
    id:"ai-video", tall:true,
    icon: <FilmReel3D />,
    iconBg: "linear-gradient(135deg,#8b5cf6,#ec4899)",
    iconGlow: "0 0 24px rgba(139,92,246,0.5)",
    tag:"Creator plan", tagColor:"rgba(139,92,246,0.15)", tagText:"#a78bfa",
    h:"AI Video Generation",
    p:"Kling, Veo & FLUX engines turn words and images into real video scenes.",
  },
  {
    id:"shorts",
    icon: <AIChip3D />,
    iconBg: "linear-gradient(135deg,#f59e0b,#ec4899)",
    iconGlow: "0 0 24px rgba(245,158,11,0.5)",
    tag:"Ready", tagColor:"rgba(245,158,11,0.15)", tagText:"#f59e0b",
    h:"Auto Shorts",
    p:"Your best moments auto-detected and clipped into 9:16 vertical reels.",
  },
  {
    id:"voice",
    icon: <HoloMic3D />,
    iconBg: "linear-gradient(135deg,#ec4899,#8b5cf6)",
    iconGlow: "0 0 24px rgba(236,72,153,0.5)",
    tag:"Ready", tagColor:"rgba(236,72,153,0.15)", tagText:"#f472b6",
    h:"AI Voice",
    p:"Natural text-to-speech voices including Hindi, with professional studio quality output.",
    waveArt:true,
  },
  {
    id:"magic",
    icon: <MagicWand3D />,
    iconBg: "linear-gradient(135deg,#10b981,#6366f1)",
    iconGlow: "0 0 24px rgba(16,185,129,0.5)",
    tag:"Ready", tagColor:"rgba(16,185,129,0.15)", tagText:"#34d399",
    h:"Magic Edit & Remove",
    p:"Silences, noise, colour, backgrounds — fixed in one click with AI precision.",
  },
  {
    id:"translate", span2:true,
    icon: <Globe3D />,
    iconBg: "linear-gradient(135deg,#3b82f6,#06b6d4)",
    iconGlow: "0 0 24px rgba(59,130,246,0.5)",
    tag:"Ready", tagColor:"rgba(59,130,246,0.15)", tagText:"#60a5fa",
    h:"Translate & Dub",
    p:"Captions and AI dubbing in 13 languages — go global without a studio.",
  },
];

/* ── Waveform bar helper ───────────────────────────────────── */
function WaveBars({ n = 20, colors }: { n?: number; colors: [string, string] }) {
  return (
    <div style={{ display:"flex", alignItems:"flex-end", gap:3, height:52, marginTop:12 }}>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} style={{
          flex: 1,
          height: `${30 + ((i * 37) % 70)}%`,
          borderRadius: 3,
          background: `linear-gradient(180deg,${colors[0]},${colors[1]})`,
          transformOrigin: "bottom",
          animation: `ch-bars ${0.8 + (i%4)*0.15}s ease-in-out -${((i*0.07)%0.9).toFixed(2)}s infinite`,
        }} />
      ))}
    </div>
  );
}

/* ── Big wave builder for IDE ────────────────────────────── */
const mkWave = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    delay: `-${((i * 0.09) % 1.1).toFixed(2)}s`,
    color: i % 3 === 0 ? "#00f0ff" : i % 3 === 1 ? "#8b5cf6" : "#a78bfa",
  }));

/* ── Main component ───────────────────────────────────────── */
export default function HomeLanding() {
  const { me, loading } = useAuth();
  const brand = useBrand();
  const [cat, setCat]     = useState<Catalogue | null>(null);
  const [plans, setPlans] = useState<PublicPlan[] | null>(null);
  const [yearly, setYearly] = useState(false);
  const [aiOn, setAiOn]   = useState<Record<string, boolean>>({
    "Auto Reframe": true,
    "Remove Silences": true,
    "Auto Captions": true,
    "BG Removal": false,
    "Colour Fix": true,
    "AI Noise Gate": true,
  });

  useEffect(() => {
    api<Catalogue>("/public/studios").then(setCat).catch(() => setCat(null));
    api<{ plans: PublicPlan[] }>("/public/plans").then(r => setPlans(r.plans)).catch(() => setPlans([]));
  }, []);

  const bigWave = useMemo(() => mkWave(80), []);

  if (loading) return <div className="ch" />;
  if (me) return <Navigate to="/universes" replace />;

  const year = new Date().getFullYear();

  return (
    <div className="ch" id="top">
      <Sky />

      {/* ── NAV ─────────────────────────────────────────────── */}
      <nav className="ch-nav" role="navigation" aria-label="Main">
        <div className="ch-wrap">
          <a href="#top" className="ch-brand" aria-label={`${brand} home`}>
            <span className="ch-logo">
              <Play size={15} fill="#fff" strokeWidth={0} />
            </span>
            <span className="ch-disp">{brand}</span>
          </a>

          <div className="ch-links">
            <a href="#features">Features</a>
            <a href="#features">Universes</a>
            <a href="#pricing">Pricing</a>
            <a href="#footer">About</a>
          </div>

          <div className="ch-actions">
            <Link to="/signin" className="ch-ghost">Sign In</Link>
            <Link to="/signup" className="ch-cta sm">Start Free →</Link>
          </div>
        </div>
      </nav>

      {/* ── HERO ────────────────────────────────────────────── */}
      <section className="ch-hero" id="universes">
        <div className="ch-wrap">
          {/* Left */}
          <div className="ch-hero-left">
            <div className="ch-kicker ch-rise1">
              <span className="ch-kicker-dot" />
              AI-Powered Creator Studio · Made in India
            </div>

            <h1 className="ch-rise2">
              Create Videos<br />
              <em>Without Limits</em>
            </h1>

            <p className="ch-hero-desc ch-rise3">
              The all-in-one AI studio for video editors, animators, and
              creators — edit, dub, translate and generate, all in one place.
              {cat && ` ${cat.live} AI tools ready right now.`}
            </p>

            <div className="ch-hero-ctas ch-rise4">
              <Link to="/signup" className="ch-cta lg">
                Get Started Free
              </Link>
              <a href="#features" className="ch-cta-secondary">
                <Play size={14} fill="currentColor" strokeWidth={0} />
                See Features
              </a>
            </div>

            <div className="ch-trust ch-rise5">
              <span className="ch-trust-item">
                <span className="ch-trust-dot" />
                Free forever plan
              </span>
              <span className="ch-trust-item">
                <span className="ch-trust-dot" />
                No credit card needed
              </span>
              {cat && (
                <span className="ch-trust-item">
                  <span className="ch-trust-dot" />
                  {cat.live} tools online
                </span>
              )}
            </div>
          </div>

          {/* Right: 3D workspace */}
          <Workspace live={cat?.live} />
        </div>
      </section>

      {/* ── STAT BAND ───────────────────────────────────────── */}
      <div className="ch-wrap">
        <div className="ch-stats" aria-label="Platform statistics">
          <div className="ch-stat-item">
            <span className="ch-stat-num">{cat ? cat.live : "—"}</span>
            <span className="ch-stat-label">AI Tools Live</span>
          </div>
          <div className="ch-stat-item">
            <span className="ch-stat-num">13+</span>
            <span className="ch-stat-label">Languages</span>
          </div>
          <div className="ch-stat-item">
            <span className="ch-stat-num">1080p</span>
            <span className="ch-stat-label">HD Export</span>
          </div>
          <div className="ch-stat-item">
            <span className="ch-stat-num">∞</span>
            <span className="ch-stat-label">Free Plan</span>
          </div>
        </div>
      </div>

      {/* ── BENTO GRID ──────────────────────────────────────── */}
      <section className="ch-sec ch-wrap" id="features">
        <div className="ch-sec-eyebrow">Every tool you need</div>
        <h2>The Complete Creator Toolkit</h2>
        <p className="ch-sub">
          Professional-grade AI tools that handle the heavy lifting — so you can focus on the story.
        </p>

        <div className="ch-bento">
          {BENTO.map(card => (
            <div
              key={card.id}
              className={`ch-bcard${card.span2 ? " span2" : ""}${card.tall ? " tall" : ""}`}
            >
              <div
                className="ch-bcard-icon"
                style={{ background: card.iconBg, boxShadow: card.iconGlow }}
              >
                {card.icon}
              </div>
              <h3>{card.h}</h3>
              <p>{card.p}</p>

              {/* Wave art for wide editor card */}
              {card.art && (
                <WaveBars n={28} colors={["#00f0ff","#8b5cf6"]} />
              )}
              {card.id === "ai-video" && (
                <div className="ch3-genart" aria-hidden>
                  <span style={{ background: "linear-gradient(160deg,#1e3a8a,#7c3aed 55%,#ec4899)" }}><small>“Rainy Mumbai street at night”</small></span>
                  <span style={{ background: "linear-gradient(160deg,#064e3b,#0891b2 50%,#fde68a)" }}><small>“Drone over tea gardens”</small></span>
                  <span style={{ background: "linear-gradient(160deg,#431407,#ea580c 50%,#fef3c7)" }}><small>“Product spinning on a pedestal”</small></span>
                </div>
              )}
              {/* Wave art for voice card */}
              {card.waveArt && (
                <WaveBars n={16} colors={["#ec4899","#8b5cf6"]} />
              )}

              <span
                className="ch-bcard-tag"
                style={{ background: card.tagColor, color: card.tagText }}
              >
                {card.tag}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ── PRO IDE SHOWCASE ────────────────────────────────── */}
      <section className="ch-ide-section ch-wrap">
        <div style={{ textAlign:"center", marginBottom:0 }}>
          <div className="ch-sec-eyebrow">Pro Editor IDE</div>
          <h2>Your Studio, in the Browser</h2>
          <p className="ch-sub">
            A full non-linear editor with AI tools baked in — no install, no limits.
          </p>
        </div>

        <div className="ch-ide-wrap">
          <div className="ch-ide-frame">
            {/* Topbar */}
            <div className="ch-ide-topbar">
              <div className="ch-ide-dots">
                <i style={{ background:"#F87171" }} />
                <i style={{ background:"#FBBF24" }} />
                <i style={{ background:"#34D399" }} />
              </div>
              <span className="ch-ide-title">YouTube Buddy Pro Editor — Project: New Story.ybs</span>
              <div className="ch-ide-tabs">
                <span className="ch-ide-tab active">Timeline</span>
                <span className="ch-ide-tab">Export</span>
                <span className="ch-ide-tab">AI</span>
              </div>
              <div className="ch-ide-status">
                <span className="ch-ide-status-dot" />
                Auto-saving
              </div>
            </div>

            {/* Body grid */}
            <div className="ch-ide-body">
              {/* Left panel: assets */}
              <div className="ch-ide-panel">
                <b>Assets</b>
                {[
                  { bg:"linear-gradient(180deg,#93a5d8,#3a4466)" },
                  { bg:"linear-gradient(180deg,#c4b5fd,#312e81)" },
                  { bg:"linear-gradient(180deg,#334155,#0f172a)" },
                  { bg:"linear-gradient(180deg,#7c3aed,#1e1b4b)" },
                ].map((t,i) => (
                  <div key={i} className="ch-ide-thumb" style={{ background:t.bg }} />
                ))}
                <div style={{ marginTop:4 }}>
                  {[
                    ["#4c1d95","Scene Opening"],
                    ["#1e3a8a","Voice Story"],
                    ["#065f46","Background Music"],
                    ["#6d28d9","Video Overlays"],
                  ].map(([c,n]) => (
                    <div key={n} style={{ display:"flex",alignItems:"center",gap:8,padding:"5px 0",fontSize:12,color:"#64748b",borderBottom:"1px solid rgba(255,255,255,0.05)" }}>
                      <span style={{ width:28,height:16,borderRadius:4,background:c,flexShrink:0 }} />
                      {n}
                    </div>
                  ))}
                </div>
              </div>

              {/* Centre: video preview */}
              <div className="ch-ide-panel-col" style={{ display:"flex",flexDirection:"column",gap:0 }}>
                <div style={{ padding:"12px 12px 0",fontSize:12,color:"#64748b",fontWeight:600 }}>Video Preview</div>
                <div className="ch-ide-preview">
                  <div className="ch-ide-preview-sky" />
                  <div className="ch-ide-preview-glow" />
                  <div className="ch-ide-preview-horizon" />
                  <div className="ch-ide-preview-city" />
                </div>
                <div className="ch-ide-transport">
                  <div className="ch-ide-play-btn">
                    <div className="ch-ide-play-tri" />
                  </div>
                  <div className="ch-ide-prog">
                    <div className="ch-ide-prog-fill" />
                  </div>
                  <span>01:12 / 04:38</span>
                  <span style={{ marginLeft:"auto",color:"#4b5563" }}>16:9 · 30 fps</span>
                </div>
              </div>

              {/* Right panel: AI tools */}
              <div className="ch-ide-panel right">
                <b>AI Tools</b>
                {Object.entries(aiOn).map(([k, v]) => (
                  <div key={k} className="ch-ai-row">
                    <span>{k}</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={v}
                      className={`ch-sw2${v ? " on" : ""}`}
                      onClick={() => setAiOn({ ...aiOn, [k]: !v })}
                      aria-label={`Toggle ${k}`}
                    />
                  </div>
                ))}
              </div>

              {/* Timeline spanning all cols */}
              <div className="ch-ide-tline">
                <div className="ch-ide-tl-head" />
                {/* Video track */}
                <div className="ch-ide-tl-row">
                  {[["#93a5d8,#3a4466","2"],["#c4b5fd,#312e81","3"],["#7c3aed,#1e1b4b","2"],["#93a5d8,#3a4466","4"]].map((s,i) => {
                    const [g,f] = s;
                    return (
                      <span key={i} style={{
                        flex: +f,
                        borderRadius: 6,
                        background: `linear-gradient(180deg,${g})`,
                      }} />
                    );
                  })}
                </div>
                {/* Audio track */}
                <div className="ch-ide-tl-row" style={{ height:20 }}>
                  <span style={{ flex:5,borderRadius:6,background:"linear-gradient(90deg,rgba(0,240,255,.5),rgba(0,180,200,.35))" }} />
                  <span style={{ flex:3,borderRadius:6,background:"linear-gradient(90deg,rgba(0,180,200,.4),rgba(0,140,170,.25))" }} />
                  <span style={{ flex:3 }} />
                </div>
                {/* Waveform */}
                <div className="ch-ide-wave">
                  {bigWave.map((n, i) => (
                    <i key={i} style={{
                      background: `linear-gradient(180deg,${n.color},rgba(0,0,0,0))`,
                      animationDelay: n.delay,
                    }} />
                  ))}
                </div>
                {/* Effects track */}
                <div className="ch-ide-tl-row" style={{ height:16 }}>
                  <span style={{ flex:2,borderRadius:5,background:"rgba(52,211,153,.5)" }} />
                  <span style={{ flex:1 }} />
                  <span style={{ flex:4,borderRadius:5,background:"rgba(52,211,153,.4)" }} />
                  <span style={{ flex:2 }} />
                  <span style={{ flex:3,borderRadius:5,background:"rgba(52,211,153,.5)" }} />
                </div>
              </div>
            </div>
          </div>
        </div>

        <IdeWidgets />

        {/* Feature chips under IDE */}
        <div style={{ display:"flex", justifyContent:"center", gap:12, marginTop:28, flexWrap:"wrap" }}>
          {["Multi-Track Timeline","AI Node Graph","Colour Grading","Real-Time Scopes","AI Assistant Sidebar"].map(chip => (
            <span key={chip} style={{
              display:"flex",alignItems:"center",gap:7,
              fontSize:13,fontWeight:600,color:"#94a3b8",
              padding:"8px 16px",borderRadius:999,
              border:"1px solid rgba(255,255,255,0.08)",
              background:"rgba(255,255,255,0.03)",
            }}>
              <CheckCircle2 size={13} color="#00f0ff" />
              {chip}
            </span>
          ))}
        </div>
      </section>

      {/* ── PRICING ─────────────────────────────────────────── */}
      {plans && plans.length > 0 && (
        <section className="ch-sec ch-wrap" id="pricing">
          <div className="ch-sec-eyebrow">Pricing</div>
          <h2>Unleash Your Creativity</h2>
          <p className="ch-sub">Powerful plans for creators of all sizes. Start free, upgrade when you're ready.</p>

          <div style={{ display:"flex", justifyContent:"center", margin:"40px 0" }}>
            <div className="ch-toggle" role="radiogroup" aria-label="Billing period">
              <button type="button" role="radio" aria-checked={!yearly} className={!yearly ? "on" : ""} onClick={() => setYearly(false)}>Monthly</button>
              <button type="button" role="radio" aria-checked={yearly}  className={yearly  ? "on" : ""} onClick={() => setYearly(true)}>Yearly · 2 months free</button>
            </div>
          </div>

          <div className="ch-plans">
            {plans.map(p => {
              const pop = p.id === "creator";
              const price = yearly ? p.year_price_inr : p.price_inr;
              return (
                <div key={p.id} className={`ch-plan${pop ? " pop" : ""}`}>
                  {pop && <span className="badge">MOST POPULAR</span>}
                  <span className="name">{p.name}</span>
                  <span className="plan-desc">{p.blurb}</span>
                  <span className="price">
                    {price ? inr(price) : "₹0"}
                    {price ? <small>&nbsp;/ {yearly ? "year" : "month"}</small> : null}
                  </span>
                  <ul>
                    {(PLAN_POINTS[p.id] ?? []).map(x => <li key={x}>{x}</li>)}
                  </ul>
                  <Link
                    to={p.id === "free" ? "/signup" : go(`/settings?plan=${p.id}`)}
                    className="go"
                  >
                    {p.id === "free" ? "Start Now — Free" : `Go ${p.name}`}
                    <ArrowRight size={15} style={{ marginLeft:6, verticalAlign:"middle" }} />
                  </Link>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── CTA BAND ────────────────────────────────────────── */}
      <div className="ch-wrap">
        <div className="ch-cta-band">
          <div className="ch-cta-band-inner">
            <div className="ch-cta-band-glow" />
            <div className="ch-sec-eyebrow" style={{ margin:0 }}>
              <Zap size={12} style={{ marginRight:4, verticalAlign:"middle" }} />
              Ready to create?
            </div>
            <h2>Your best videos start here.</h2>
            <p>Join creators building extraordinary content with AI tools that actually work.</p>
            <div style={{ display:"flex", gap:14, justifyContent:"center", flexWrap:"wrap" }}>
              <Link to="/signup" className="ch-cta lg">Start for Free — No Card Needed</Link>
              <a href="#features" className="ch-cta-secondary">
                <Layers size={15} />
                Explore Features
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* ── FOOTER ──────────────────────────────────────────── */}
      <footer className="ch-foot" id="footer">
        <div className="ch-wrap">
          <div className="ch-foot-inner">
            <div>
              <a href="#top" className="ch-foot-brand">
                <span className="ch-logo" style={{ width:36,height:36 }}>
                  <Play size={15} fill="#fff" strokeWidth={0} />
                </span>
                <span className="ch-disp">{brand}</span>
              </a>
              <p className="ch-foot-desc">
                The AI-powered video studio built for Indian creators — and everyone else.
                Made with ♥ in India.
              </p>
              <div className="ch-foot-social" aria-label="Social links">
                {([Facebook, Instagram, XIcon, Youtube] as const).map((I, i) => (
                  <span key={i} className="ch-foot-soc" aria-hidden>
                    <I size={15} color="#94a3b8" />
                  </span>
                ))}
              </div>
            </div>

            <div className="ch-foot-col">
              <b>Product</b>
              <a href="#features">Features</a>
              <Link to={go("/ai-generator")}>AI Generator</Link>
              <Link to={go("/editor")}>Pro Editor</Link>
              <a href="#pricing">Pricing</a>
            </div>

            <div className="ch-foot-col">
              <b>Resources</b>
              <Link to="/signup">Create account</Link>
              <Link to="/signin">Sign in</Link>
              <a href="#features">Universes</a>
            </div>

            <div className="ch-foot-col">
              <b>Legal</b>
              <Link to="/privacy">Privacy policy</Link>
              <Link to="/terms">Terms of use</Link>
            </div>
          </div>

          <p className="ch-copy">
            © {year} {brand}.
            {cat ? ` Servers online · ${cat.live} AI tools ready.` : ""}
            {" "}Made in India 🇮🇳
          </p>
        </div>
      </footer>
    </div>
  );
}
