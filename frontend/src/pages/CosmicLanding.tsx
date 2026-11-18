import { CSSProperties, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Captions, Facebook, Instagram, Languages, Mic, Play, Smartphone, Sparkles, Users, Video, Wand2, X as XIcon, Youtube, LayoutPanelTop } from "lucide-react";
import { api } from "../api";
import { useAuth, useBrand } from "../App";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import "@fontsource/space-grotesk/latin-500.css";
import "@fontsource/space-grotesk/latin-700.css";
import "../cosmic.css";

/* Signed-out home: the "Creator Universe" cosmic design. Tool counts and prices come from the server
   (/public/studios, /public/plans) — nothing is a placeholder, and features that aren't switched on say so. */

type Catalogue = { total: number; live: number };
type PublicPlan = { id: string; name: string; price_inr: number; year_price_inr: number; ai_credit_inr: number | null; blurb: string };

const go = (route: string) => `/signin?next=${encodeURIComponent(route)}`;
const inr = (n: number) => "₹" + n.toLocaleString("en-IN");

const PLAN_POINTS: Record<string, string[]> = {
  free: ["Full multitrack editor", "Captions, translation, dubbing, voices", "Background and object removal", "1080p export with a small badge"],
  creator: ["Everything in Free", "No badge on exports", "Premium AI credit every month", "AI video, image and voice engines"],
  pro: ["Everything in Creator", "More premium AI credit", "Priority queue for exports and AI", "For teams and busy channels"],
};

const wave = (n: number, min: number, color: string) =>
  Array.from({ length: n }, (_, i) => (
    <i key={i} style={{ height: `${min + ((i * 37) % (100 - min))}%`, background: color, animationDelay: `-${((i * 0.11) % 1.2).toFixed(2)}s` }} />
  ));

function Sky() {
  const neb = (s: CSSProperties) => <div className="cu-neb" style={s} />;
  return (
    <div className="cu-sky" aria-hidden>
      {neb({ width: 1100, height: 700, left: "50%", marginLeft: -550, top: -260, background: "radial-gradient(ellipse, rgba(124,58,237,.55), rgba(124,58,237,0) 65%)" })}
      {neb({ width: 700, height: 700, left: -260, top: 200, background: "radial-gradient(circle, rgba(59,130,246,.35), rgba(59,130,246,0) 65%)", animationDelay: "-8s" })}
      {neb({ width: 700, height: 700, right: -260, top: 120, background: "radial-gradient(circle, rgba(168,85,247,.4), rgba(168,85,247,0) 65%)" })}
      {neb({ width: 900, height: 900, left: "50%", marginLeft: -450, top: 1500, background: "radial-gradient(circle, rgba(124,58,237,.28), rgba(124,58,237,0) 65%)", animationDelay: "-5s" })}
      {neb({ width: 900, height: 900, right: -300, top: 2500, background: "radial-gradient(circle, rgba(79,70,229,.32), rgba(79,70,229,0) 65%)" })}
      <div className="cu-stars" /><div className="cu-stars2" />
    </div>
  );
}

function Scene({ big }: { big?: boolean }) {
  return (
    <div className="cu-scene" style={big ? { flex: 1, background: "linear-gradient(180deg,#7C8DBF 0%,#C9C2EA 40%,#EDE9FE 50%,#5A6690 51%)" } : undefined}>
      <span className="cu-cloud" /><i className="cu-m1" /><i className="cu-snow" /><i className="cu-m2" />
    </div>
  );
}

const FEATURES = [
  { t: "AI Video Generation", d: "Video scenes from words and images with top engines.", tag: "Creator plan", soon: true, icon: Video, c: ["#8B5CF6", "#EC4899"] },
  { t: "Universal Editor", d: "Multi-track timeline, titles, colour wheels and live scopes.", tag: "Unlimited", icon: LayoutPanelTop, c: ["#6366F1", "#3B82F6"] },
  { t: "Auto Shorts", d: "Your best moments become 9:16 clips automatically.", tag: "Ready", icon: Smartphone, c: ["#F59E0B", "#EC4899"] },
  { t: "AI Voice", d: "Natural text-to-speech voices, Hindi included.", tag: "Ready", icon: Mic, c: ["#EC4899", "#8B5CF6"] },
  { t: "Magic Edit & Remove", d: "Silences, noise, colour and backgrounds in one click.", tag: "Ready", icon: Wand2, c: ["#10B981", "#6366F1"] },
  { t: "Translate & Dub", d: "Captions and voice in 13 languages.", tag: "Ready", icon: Languages, c: ["#3B82F6", "#06B6D4"] },
];

export default function CosmicLanding() {
  const { me, loading } = useAuth();
  const brand = useBrand();
  const [cat, setCat] = useState<Catalogue | null>(null);
  const [plans, setPlans] = useState<PublicPlan[] | null>(null);
  const [yearly, setYearly] = useState(false);
  const [tools, setTools] = useState<Record<string, boolean>>({ "Auto Reframe": true, "Remove Silences": true, "Auto Captions": true, "Background Removal": false, "Colour Fix": true });

  useEffect(() => {
    api<Catalogue>("/public/studios").then(setCat).catch(() => setCat(null));
    api<{ plans: PublicPlan[] }>("/public/plans").then((r) => setPlans(r.plans)).catch(() => setPlans([]));
  }, []);

  const heroWave = useMemo(() => wave(70, 30, "linear-gradient(180deg,#C4B5FD,#7C3AED)"), []);
  const bigWave = useMemo(() => wave(90, 25, "linear-gradient(180deg,#6EE7B7,#059669)"), []);

  if (loading) return <div className="cu" />;
  if (me) return <Navigate to="/universes" replace />;

  const year = new Date().getFullYear();

  return (
    <div className="cu" id="top">
      <Sky />

      <header className="cu-wrap cu-nav">
        <a href="#top" className="cu-brand" aria-label={`${brand} home`}><span className="cu-logo"><Play size={15} fill="#fff" strokeWidth={0} /></span><span className="cu-disp">{brand}</span></a>
        <nav className="cu-links" aria-label="Main">
          <a href="#features">Features</a><a href="#universes">Universes</a><a href="#pricing">Pricing</a><a href="#footer">About Us</a>
        </nav>
        <div className="cu-actions">
          <Link to="/signin" className="cu-ghost">Sign In</Link>
          <Link to="/signup" className="cu-cta sm">Start Free</Link>
        </div>
      </header>

      <section className="cu-wrap cu-hero">
        <p className="cu-kicker cu-disp cu-rise1">THE FUTURE OF CREATION IS HERE</p>
        <h1 className="cu-rise2">TELL YOUR STORY<br /><span className="cu-grad">WITHOUT LIMITS</span></h1>
        <p className="cu-lead cu-rise3">The AI-powered home for video editors, animators and creators to bring their stories to life — made for Indian creators.</p>
        <div className="cu-rise3" style={{ marginTop: 28 }}><Link to="/signup" className="cu-cta lg">Get Started for Free</Link></div>

        <div className="cu-stage cu-rise4" aria-hidden>
          <div className="cu-horizon" />
          <div className="cu-frame cu-hero-win">
            <div className="cu-win">
              <div className="cu-dots"><i style={{ background: "#F87171" }} /><i style={{ background: "#FBBF24" }} /><i style={{ background: "#34D399" }} /><span style={{ marginLeft: 10 }}>Project: New Story</span></div>
              <div className="cu-panel cu-thumbs">
                {["#4C1D95,#1E1B4B", "#1E3A8A,#0F172A", "#6D28D9,#312E81", "#334155,#1E1B4B", "#7C3AED,#1E3A8A", "#0F766E,#1E1B4B"].map((g) => <span key={g} style={{ background: `linear-gradient(180deg,${g})` }} />)}
              </div>
              <Scene />
              <div className="cu-panel cu-tools"><b style={{ color: "#fff" }}>AI Tools</b><span /><span /><span /><span /></div>
              <div className="cu-tl">
                <div className="cu-head" />
                <div className="cu-row" style={{ height: 22 }}><span style={{ flex: 3, background: "#6D28D9" }} /><span style={{ flex: 5, background: "#7C3AED" }} /><span style={{ flex: 3, background: "#6366F1" }} /></div>
                <div className="cu-wave" style={{ height: 28 }}>{heroWave}</div>
                <div className="cu-row" style={{ height: 18 }}><span style={{ flex: 4, background: "rgba(52,211,153,.55)" }} /><span style={{ flex: 2 }} /><span style={{ flex: 3, background: "rgba(52,211,153,.55)" }} /></div>
              </div>
            </div>
          </div>
          <div className="cu-phone"><div>
            <div style={{ height: 150, borderRadius: 16, overflow: "hidden", position: "relative", background: "linear-gradient(180deg,#A5B4FC,#C4B5FD 45%,#4C1D95 46%)" }}>
              <i style={{ position: "absolute", inset: 0, background: "#2E2A5A", clipPath: "polygon(0 70%,30% 45%,55% 66%,80% 40%,100% 60%,100% 100%,0 100%)" }} />
            </div>
            <span style={{ fontSize: 11, color: "#A59CC8" }}>AI Tools</span>
            <span className="cu-sw">Auto Reframe<span className="cu-switch on" /></span>
            <span className="cu-sw">Captions<span className="cu-switch on" /></span>
          </div></div>
          <div className="cu-tiles">
            <span><Sparkles size={20} color="#C4B5FD" />Smart Video</span>
            <span><Wand2 size={20} color="#C4B5FD" />Magic Edit</span>
            <span><Captions size={20} color="#C4B5FD" />Captions</span>
            <span><Smartphone size={20} color="#C4B5FD" />Auto Shorts</span>
          </div>
        </div>
      </section>

      <section className="cu-wrap cu-sec" id="universes">
        <h2>Choose Your Universe</h2>
        <p className="cu-sub">Explore our specialized creation ecosystems.</p>
        <div className="cu-grid3">
          <Link to={go("/ai-generator")} className="cu-card" style={{ background: "linear-gradient(170deg,rgba(124,58,237,.3),rgba(18,13,46,.9) 65%)", borderColor: "rgba(167,139,250,.35)" }}>
            <span className="t cu-disp">AI GENERATOR UNIVERSE</span>
            <span className="cu-art" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }} aria-hidden>
              <span className="cu-models"><span><b className="cu-disp">K</b>Kling</span><span><span className="cu-flux" />FLUX</span><span><b className="cu-disp" style={{ fontSize: 15 }}>veo</b>Veo</span></span>
              <span style={{ display: "flex", gap: 8 }}>
                <span className="cu-pill" style={{ background: "rgba(250,204,21,.18)", color: "#FDE68A" }}>Top video engines</span>
                {cat && <span className="cu-pill" style={{ background: "rgba(139,92,246,.25)", color: "#DDD6FE" }}>{cat.live} tools ready</span>}
              </span>
            </span>
            <p>Kling, FLUX and Veo engines on the Creator plan, plus {cat ? cat.live : "dozens of"} tools that run today.</p>
            <span className="cu-btn" style={{ border: "1px solid rgba(167,139,250,.7)", background: "rgba(139,92,246,.18)" }}>Enter AI Generator</span>
          </Link>

          <Link to={go("/editor")} className="cu-card" style={{ background: "linear-gradient(170deg,rgba(59,130,246,.25),rgba(18,13,46,.9) 65%)", borderColor: "rgba(147,197,253,.3)" }}>
            <span className="t cu-disp">EDITOR UNIVERSE</span>
            <span className="cu-art" style={{ padding: 10, display: "flex", flexDirection: "column", gap: 6 }} aria-hidden>
              <span style={{ flex: 1, borderRadius: 8, position: "relative", overflow: "hidden", background: "linear-gradient(180deg,#93A5D8,#C4B5FD 50%,#3A4466 51%)" }}><i style={{ position: "absolute", inset: 0, background: "#2A3156", clipPath: "polygon(0 75%,25% 45%,45% 65%,70% 35%,100% 62%,100% 100%,0 100%)" }} /></span>
              <span className="cu-row" style={{ height: 12 }}><span style={{ flex: 3, background: "#6366F1" }} /><span style={{ flex: 5, background: "#8B5CF6" }} /><span style={{ flex: 2, background: "#3B82F6" }} /></span>
              <span style={{ height: 12, borderRadius: 3, background: "repeating-linear-gradient(90deg,#34D399 0 2px,transparent 2px 5px)", opacity: 0.7 }} />
            </span>
            <p>Professional timeline, titles, waveforms, colour wheels and live scopes.</p>
            <span className="cu-btn" style={{ border: "1px solid rgba(147,197,253,.7)", background: "rgba(59,130,246,.18)" }}>Enter Editor Universe</span>
          </Link>

          <div className="cu-card hov" style={{ background: "linear-gradient(170deg,rgba(255,255,255,.07),rgba(18,13,46,.9) 65%)", borderColor: "rgba(255,255,255,.15)" }}>
            <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><span className="t cu-disp">SUPER UNIVERSE</span><span className="cu-pill" style={{ background: "rgba(255,255,255,.1)", color: "#CFC7EA" }}>Roadmap</span></span>
            <span className="cu-art" style={{ display: "grid", placeItems: "center" }} aria-hidden>
              <span className="cu-hub"><i style={{ left: -7, top: 55, background: "#6366F1" }} /><i style={{ right: -7, top: 55, background: "#8B5CF6" }} /><i style={{ left: 55, top: -7, background: "#3B82F6" }} /><i style={{ left: 55, bottom: -7, background: "#A78BFA" }} /></span>
              <span style={{ width: 54, height: 54, borderRadius: 16, background: "linear-gradient(135deg,#8B5CF6,#4F46E5)", display: "grid", placeItems: "center", boxShadow: "0 0 30px rgba(139,92,246,.6)" }}><Users size={24} color="#fff" /></span>
            </span>
            <p>A centralized command hub for teams, automation and workflows.</p>
            <span className="cu-btn" style={{ border: "1px solid rgba(255,255,255,.2)", color: "#A59CC8", fontWeight: 600 }}>Locked / Roadmap</span>
          </div>
        </div>
      </section>

      <section className="cu-wrap cu-sec" id="features">
        <h2>AI-Powered Capabilities</h2>
        <p className="cu-sub">Integrated tools that do the heavy lifting.</p>
        <div className="cu-grid3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 20 }}>
          {FEATURES.map(({ t, d, tag, soon, icon: Icon, c }) => (
            <div key={t} className="cu-card hov cu-feat">
              <span className="cu-pill tag" style={soon ? { background: "rgba(255,255,255,.1)", color: "#CFC7EA" } : { background: "rgba(139,92,246,.35)", color: "#EDE9FE" }}>{tag}</span>
              <h3>{t}</h3><p>{d}</p>
              <span className="ico" aria-hidden style={{ background: `linear-gradient(135deg,${c[0]},${c[1]})`, boxShadow: `0 14px 34px ${c[0]}77` }}><Icon size={36} color="#fff" strokeWidth={1.8} /></span>
            </div>
          ))}
        </div>
      </section>

      <section className="cu-wrap cu-sec cu-big" aria-label="The editor">
        <div className="cu-frame" style={{ borderRadius: 20, boxShadow: "0 50px 100px rgba(0,0,0,.55), 0 0 80px rgba(139,92,246,.25)" }}>
          <div className="cu-win" style={{ borderRadius: 19, background: "rgba(13,10,34,.97)" }}>
            <div className="bar"><b>Project: New Story</b><span style={{ color: "#A59CC8" }}>16:9 · 30 fps</span><span style={{ marginLeft: "auto", color: "#CFC7EA" }}>Your workspace</span><span style={{ width: 26, height: 26, borderRadius: "50%", background: "linear-gradient(135deg,#F59E0B,#EC4899)" }} /></div>
            <div className="rail" aria-hidden><i /><i /><i /><i /><i /></div>
            <div className="col assets" aria-hidden>
              <b>Assets</b>
              <div className="cu-thumbs">{["#93A5D8,#3A4466", "#C4B5FD,#312E81", "#334155,#0F172A", "#7C3AED,#1E1B4B"].map((g) => <span key={g} style={{ height: 62, borderRadius: 8, background: `linear-gradient(180deg,${g})` }} />)}</div>
              {[["#4C1D95", "Scene Opening"], ["#1E3A8A", "Voice Story"], ["#065F46", "Background music"], ["#6D28D9", "Video overlays"]].map(([c, n]) => <span key={n} className="line"><i style={{ background: c }} />{n}</span>)}
            </div>
            <div className="col" aria-hidden>
              <b>Video preview</b>
              <Scene big />
              <div className="cu-transport"><span className="p"><Play size={11} fill="#0D0A22" strokeWidth={0} /></span><span className="cu-prog"><i /></span>01:12 / 04:38</div>
            </div>
            <div className="col ai">
              <b>AI Tools</b>
              {Object.entries(tools).map(([k, v]) => (
                <button key={k} type="button" role="switch" aria-checked={v} onClick={() => setTools({ ...tools, [k]: !v })}>{k}<span className={`cu-switch big${v ? " on" : ""}`} /></button>
              ))}
            </div>
            <div className="tline" aria-hidden>
              <div className="cu-head" style={{ top: 8, bottom: 8 }} />
              <div className="cu-row" style={{ height: 34 }}>{["#93A5D8,#3A4466:2", "#C4B5FD,#312E81:3", "#7C3AED,#1E1B4B:2", "#93A5D8,#3A4466:4"].map((s, i) => { const [g, f] = s.split(":"); return <span key={i} style={{ flex: +f, borderRadius: 6, background: `linear-gradient(180deg,${g})` }} />; })}</div>
              <div className="cu-row" style={{ height: 28 }}><span style={{ flex: 5, borderRadius: 6, background: "linear-gradient(90deg,#7C3AED,#A78BFA)" }} /><span style={{ flex: 3, borderRadius: 6, background: "linear-gradient(90deg,#6D28D9,#8B5CF6)" }} /><span style={{ flex: 3 }} /></div>
              <div className="cu-wave" style={{ height: 34, alignItems: "center" }}>{bigWave}</div>
            </div>
          </div>
        </div>
      </section>

      {plans && plans.length > 0 && (
        <section className="cu-wrap cu-sec" id="pricing">
          <h2>Unleash Your Creativity</h2>
          <p className="cu-sub">Powerful plans for creators of all sizes.</p>
          <div className="cu-toggle" role="radiogroup" aria-label="Billing period">
            <button type="button" role="radio" aria-checked={!yearly} className={!yearly ? "on" : ""} onClick={() => setYearly(false)}>Monthly</button>
            <button type="button" role="radio" aria-checked={yearly} className={yearly ? "on" : ""} onClick={() => setYearly(true)}>Yearly, 2 months free</button>
          </div>
          <div className="cu-grid3" style={{ alignItems: "stretch" }}>
            {plans.map((p) => {
              const pop = p.id === "creator";
              const price = yearly ? p.year_price_inr : p.price_inr;
              return (
                <div key={p.id} className={`cu-card hov cu-plan${pop ? " pop" : ""}`}>
                  {pop && <span className="badge">MOST POPULAR</span>}
                  <span className="name">{p.name}</span>
                  <span style={{ color: "#A59CC8", fontSize: 14 }}>{p.blurb}</span>
                  <span className="price">{price ? inr(price) : "₹0"}{price ? <small> / {yearly ? "year" : "month"}</small> : null}</span>
                  <ul>{(PLAN_POINTS[p.id] ?? []).map((x) => <li key={x}>{x}</li>)}</ul>
                  <Link to={p.id === "free" ? "/signup" : go(`/settings?plan=${p.id}`)} className="go">{p.id === "free" ? "Start Now" : `Go ${p.name}`}</Link>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <footer className="cu-foot" id="footer">
        <div className="cu-wrap cols">
          <div style={{ flex: "1 1 260px", gap: 16 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 10 }}><span className="cu-logo" style={{ width: 40, height: 40 }}><Play size={17} fill="#fff" strokeWidth={0} /></span><b className="cu-disp" style={{ fontSize: 20 }}>{brand}</b></span>
            <span style={{ color: "#A59CC8" }}>Made in India for creators everywhere.</span>
            <span style={{ display: "flex", gap: 10 }} aria-label="Social links (coming soon)">
              {[Facebook, Instagram, XIcon, Youtube].map((I, i) => <span key={i} style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(255,255,255,.08)", display: "grid", placeItems: "center" }}><I size={15} color="#CFC7EA" aria-hidden /></span>)}
            </span>
          </div>
          <div><b>Product</b><a href="#features">Features</a><Link to={go("/ai-generator")}>AI Generator</Link><Link to={go("/editor")}>Editor</Link></div>
          <div><b>Resources</b><a href="#pricing">Pricing</a><Link to="/signup">Create account</Link></div>
          <div><b>Legal</b><Link to="/privacy">Privacy</Link><Link to="/terms">Terms of use</Link></div>
        </div>
        <p className="copy">© {year} {brand}. {cat ? `Servers online, ${cat.live} AI tools working.` : ""}</p>
      </footer>
    </div>
  );
}
