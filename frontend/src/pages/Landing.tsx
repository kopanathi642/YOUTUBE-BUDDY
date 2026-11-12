import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Check, Menu, Search, X } from "lucide-react";
import { api } from "../api";
import { useAuth, useBrand } from "../App";
import "@fontsource/bricolage-grotesque/latin-500.css";
import "@fontsource/bricolage-grotesque/latin-700.css";
import "@fontsource/bricolage-grotesque/latin-800.css";
import "@fontsource/hind/latin-400.css";
import "@fontsource/hind/latin-600.css";
import "@fontsource/hind/devanagari-400.css";
import "@fontsource/hind/devanagari-600.css";
import "@fontsource/hind-madurai/tamil-600.css";
import "@fontsource/hind-guntur/telugu-600.css";
import "../landing.css";
import Stage from "./landing/Stage";
import { useScrollStory } from "./landing/useScrollStory";

/* Signed-out landing: a creator's day told as one scroll story, from night (raw footage) to sunrise (published).
   Counts and prices come from the server (/public/studios, /public/plans): nothing here is a placeholder. */

type Studio = { id: string; code: string; name: string; tagline: string; total: number; live: number; live_tools: string[] };
type Catalogue = { studios: Studio[]; total: number; live: number };
type PublicPlan = { id: string; name: string; price_inr: number; year_price_inr: number; ai_credit_inr: number | null; blurb: string };

const go = (route: string) => `/signin?next=${encodeURIComponent(route)}`;
const studioRoute = (id: string) => `/ai-generator/studio/${id}`;

// The story. Each chapter is a real step in the editor, in the order a creator does them.
const CHAPTERS = [
  { h: "Drop in the clip.", p: "Your footage shows up the moment you drop it, with a preview straight away. It's ready to cut in seconds, even 4K, while the rest finishes in the background." },
  { h: "Cut on a real timeline.", p: "Trim, split and ripple on a multitrack timeline in the browser. Silences can go in one click, and every change saves itself." },
  { h: "Captions write themselves.", p: "Speech becomes captions automatically, then Hindi with one click. Titles can be typed in 10 Indian scripts, from Tamil to Telugu." },
  { h: "Speak Hindi in your own video.", p: "Translate the script and add a natural Hindi voice-over that follows your timing. It runs on our own servers, so there's no per-minute fee." },
  { h: "Turn one video into Shorts.", p: "The highlight finder picks the best moments and reframes them to 9:16, keeping the subject centred in every frame." },
  { h: "Publish, then watch it grow.", p: "Export in the cloud while you close the tab. Your channel tools show which titles and posting times actually work for you." },
];

function useCatalogue() {
  const [cat, setCat] = useState<Catalogue | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { api<Catalogue>("/public/studios").then((c) => setCat({ ...c, studios: c.studios.filter((s) => s.live > 0) })).catch(() => setFailed(true)); }, []);
  return { cat, failed };
}

function usePlans() {
  const [plans, setPlans] = useState<PublicPlan[] | null>(null);
  useEffect(() => { api<{ plans: PublicPlan[] }>("/public/plans").then((r) => setPlans(r.plans)).catch(() => setPlans([])); }, []);
  return plans;
}

const PLAN_POINTS: Record<string, string[]> = {
  free: ["Full multitrack editor", "Captions, translation, Hindi dubbing, voices", "Background and object removal", "1080p export with a small badge"],
  creator: ["Everything in Free", "No badge on exports", "Premium AI credit every month", "Hosted video, image and voice models"],
  pro: ["Everything in Creator", "More premium AI credit", "Priority queue for exports and AI", "For teams and busy channels"],
};

function Pricing({ plans }: { plans: PublicPlan[] | null }) {
  const [yearly, setYearly] = useState(false);
  if (plans && !plans.length) return null;   // prices couldn't load: show nothing rather than a guess
  return (
    <section className="lp-block" id="pricing" aria-labelledby="pr-h">
      <div className="lp-block-head">
        <h2 id="pr-h">Free to start. Pay in rupees when you grow.</h2>
        <div className="lp-toggle" role="radiogroup" aria-label="Billing period">
          <button type="button" role="radio" aria-checked={!yearly} className={!yearly ? "on" : ""} onClick={() => setYearly(false)}>Monthly</button>
          <button type="button" role="radio" aria-checked={yearly} className={yearly ? "on" : ""} onClick={() => setYearly(true)}>Yearly, 2 months free</button>
        </div>
      </div>
      <div className="lp-plans">
        {(plans ?? []).map((p) => (
          <div key={p.id} className={`lp-plan${p.id === "creator" ? " hl" : ""}`}>
            <h3>{p.name}</h3>
            <p className="lp-price">{p.price_inr === 0 ? <b>₹0</b> : yearly
              ? <><b>₹{p.year_price_inr.toLocaleString("en-IN")}</b> a year</>
              : <><b>₹{p.price_inr}</b> a month</>}</p>
            <p className="lp-credit">{p.ai_credit_inr ? `Includes ₹${p.ai_credit_inr} of premium AI each month` : "Free AI tools, no limit"}</p>
            <ul>{(PLAN_POINTS[p.id] ?? [p.blurb]).map((x) => <li key={x}><Check size={15} aria-hidden />{x}</li>)}</ul>
            <Link to={p.price_inr ? `/signup?next=${encodeURIComponent("/settings#billing")}` : "/signup"} className={`lp-btn${p.id === "creator" ? "" : " quiet"}`}>
              {p.price_inr ? `Choose ${p.name}` : "Start free"}</Link>
          </div>
        ))}
        {!plans && [0, 1, 2].map((i) => <div key={i} className="lp-plan skel" aria-hidden />)}
      </div>
      <p className="lp-small">Pay by UPI, or PayPal from abroad. No auto-debit: each month you pay runs for 30 days. Premium AI credit covers hosted models;
        the free tools that run on our servers never use it.</p>
    </section>
  );
}

function Brand() {
  const brand = useBrand();
  return (
    <a href="#top" className="lp-brand" aria-label={`${brand} home`}>
      <svg viewBox="0 0 32 32" aria-hidden><path d="M16 3 L26 15 L16 29 L6 15 Z" fill="#f5a524" /><path d="M16 3 L16 29 M6 15 L26 15" stroke="#3b2a6b" strokeWidth="2" /></svg>
      <span>{brand}</span>
    </a>
  );
}

export default function Landing() {
  const { me, loading } = useAuth();
  const brand = useBrand();
  const { cat, failed } = useCatalogue();
  const plans = usePlans();
  const [q, setQ] = useState("");
  const [menu, setMenu] = useState(false);
  const page = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const ready = !loading && !me;
  const active = useScrollStory(page, ready);

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
  const close = () => setMenu(false);

  return (
    <div className="lp" id="top" ref={page}>
      <div className="lp-sky" aria-hidden />
      <header className="lp-nav">
        <Brand />
        <nav className={`lp-links${menu ? " open" : ""}`} aria-label="Site">
          <a href="#story" onClick={close}>How it works</a>
          <a href="#tools" onClick={close}>Tools</a>
          <a href="#pricing" onClick={close}>Pricing</a>
          <Link to="/signin" onClick={close}>Sign in</Link>
        </nav>
        <Link to="/signup" className="lp-btn sm">Start free</Link>
        <button type="button" className="lp-burger" aria-label={menu ? "Close menu" : "Open menu"} aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
          {menu ? <X size={20} /> : <Menu size={20} />}</button>
      </header>

      <main>
        <section className="lp-hero">
          <h1><span>Shoot once.</span><span>Reach every screen</span><span>in India.</span></h1>
          <div className="lp-hero-side">
            <p>A video editor and AI studio in your browser, made for Indian creators. Edit, caption, dub into Hindi and cut Shorts in one place.</p>
            <div className="lp-cta">
              <Link to="/signup" className="lp-btn">Start free</Link>
              <a href="#story" className="lp-link">See how it works</a>
            </div>
            <p className="lp-small">Free plan, no card. {cat ? `${cat.live} AI tools working right now.` : failed ? "" : " "}</p>
          </div>
        </section>

        <section className="lp-story" id="story" aria-label="How it works, from first clip to published video">
          <div className="lp-stage-wrap"><Stage /><p className="lp-step" aria-hidden>{active + 1} of {CHAPTERS.length}</p></div>
          <ol className="lp-chapters">
            {CHAPTERS.map((c, i) => (
              <li key={c.h} className={`lp-ch${i === active ? " on" : ""}`} data-ch={i}>
                <h2>{c.h}</h2><p>{c.p}</p>
              </li>
            ))}
          </ol>
        </section>

        <div className="lp-dawn">
        <section className="lp-block" id="tools" aria-labelledby="tools-h">
          <div className="lp-block-head">
            <h2 id="tools-h">{cat ? `${cat.live} AI tools are working today` : "The AI tools that work today"}</h2>
            <label className="lp-search"><Search size={16} aria-hidden />
              <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a tool, like “dub” or “thumbnail”" aria-label="Search tools" />
              {q && <button type="button" aria-label="Clear search" onClick={() => { setQ(""); searchRef.current?.focus(); }}><X size={15} /></button>}
            </label>
          </div>
          <div className="lp-dir">
            {editorMatches && (
              <Link to={go("/editor")} className="lp-dir-row"><b>Video editor</b><span>Timeline, colour, titles, captions, export</span></Link>
            )}
            {rows.map((s) => (
              <Link key={s.id} to={go(studioRoute(s.id))} className="lp-dir-row">
                <b>{s.name.replace(/^AI /, "")}</b><span>{s.live} working · {s.tagline}</span>
              </Link>
            ))}
            {!cat && !failed && Array.from({ length: 6 }, (_, i) => <div key={i} className="lp-dir-row skel" aria-hidden />)}
          </div>
          {failed && <p className="lp-small">The tool list didn't load. Sign in to see every tool.</p>}
          {cat && q && !rows.length && !editorMatches && <p className="lp-small">No tool matches “{q}”.</p>}
          <p className="lp-small">Not yet available: lip sync, removing moving objects, motion tracking, and hosted video and image generation until those
            services are connected. A tool appears here only once it really works.</p>
        </section>

        <Pricing plans={plans} />

        <section className="lp-final">
          <h2>Your first take is waiting.</h2>
          <Link to="/signup" className="lp-btn lg">Start free</Link>
        </section>
        </div>
      </main>

      <footer className="lp-foot">
        <Brand />
        <nav aria-label="Footer">
          <a href="#story">How it works</a><a href="#tools">Tools</a><a href="#pricing">Pricing</a>
          <Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link>
        </nav>
        <p>© {year} {brand}. {cat ? `Servers online, ${cat.live} AI tools working.` : failed ? "Status unavailable." : ""}</p>
      </footer>
    </div>
  );
}
