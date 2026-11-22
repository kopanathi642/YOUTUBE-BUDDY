import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Activity, IndianRupee, BadgeCheck, Heart, Clock, Search, Hash, Fingerprint, List, Rss, Image as ImageIcon, Timer, Bell, Code,
  Copy, Check, X, Play, ExternalLink, TrendingUp, Lightbulb, CalendarClock } from "lucide-react";
import { api } from "../api";
import { useAuth, useBrand } from "../App";
import { FREE_TOOLS, FreeTool, earnings, hashtags, monetization, parseTime, videoId } from "../tools/catalog";
import type { Insights } from "./Channel";

const ICONS: Record<string, typeof Activity> = { activity: Activity, "indian-rupee": IndianRupee, "badge-check": BadgeCheck, heart: Heart, clock: Clock,
  search: Search, hash: Hash, fingerprint: Fingerprint, list: List, rss: Rss, image: ImageIcon, timer: Timer, bell: Bell, code: Code };
const GROUPS = ["Channel", "Money", "Search & SEO", "Links & media"] as const;
const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const num = (n: number | null | undefined) => n == null ? "—" : n >= 1e7 ? `${(n / 1e7).toFixed(1)} Cr` : n >= 1e5 ? `${(n / 1e5).toFixed(1)} L` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(Math.round(n));

/** Free public YouTube tools: /tools (all tools) and /tools/:slug (one tool). No account needed. */
export default function FreeTools() {
  const { slug } = useParams();
  const tool = FREE_TOOLS.find((t) => t.slug === slug);
  const brand = useBrand();
  const { me } = useAuth();
  useEffect(() => { window.scrollTo(0, 0); }, [slug]);

  return (
    <div className="ft">
      <header className="ft-top">
        <Link to="/" className="ft-brand"><span className="ft-logo"><Play size={13} fill="#fff" strokeWidth={0} /></span>{brand}</Link>
        <nav className="ft-nav"><Link to="/tools">Free tools</Link>{me ? <Link to="/universes" className="btn sm primary">Open app</Link>
          : <><Link to="/signin">Sign in</Link><Link to="/signup" className="btn sm primary">Start free</Link></>}</nav>
      </header>
      {slug && !tool ? <main className="ft-main"><h1>Tool not found</h1><p className="muted">That tool doesn't exist. <Link to="/tools">See all free tools</Link>.</p></main>
        : tool ? <ToolPage t={tool} /> : <Index />}
      <footer className="ft-foot">
        <span>© {new Date().getFullYear()} {brand}</span><Link to="/tools">Free YouTube tools</Link><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link>
        <span className="dim">Not affiliated with YouTube or Google.</span>
      </footer>
    </div>
  );
}

function Index() {
  return (
    <main className="ft-main">
      <h1 className="ft-h1">Free YouTube tools for creators</h1>
      <p className="ft-lead">Audit your channel, check monetization, estimate earnings, research keywords and make the links you need. Free, no sign-up.</p>
      {GROUPS.map((g) => (
        <section key={g} className="ft-group">
          <h2>{g}</h2>
          <div className="ft-grid">{FREE_TOOLS.filter((t) => t.group === g).map((t) => <Card key={t.slug} t={t} />)}</div>
        </section>
      ))}
    </main>
  );
}

function Card({ t }: { t: FreeTool }) {
  const I = ICONS[t.icon] ?? Activity;
  return <Link to={`/tools/${t.slug}`} className="ft-card"><I size={18} aria-hidden /><b>{t.title}</b><span>{t.desc}</span></Link>;
}

function ToolPage({ t }: { t: FreeTool }) {
  const I = ICONS[t.icon] ?? Activity;
  const more = FREE_TOOLS.filter((x) => x.slug !== t.slug && x.group === t.group).concat(FREE_TOOLS.filter((x) => x.group !== t.group)).slice(0, 6);
  const Body = BODIES[t.slug];
  return (
    <main className="ft-main">
      <nav className="ft-crumb" aria-label="Breadcrumb"><Link to="/tools">Free tools</Link> / <span>{t.group}</span></nav>
      <h1 className="ft-h1"><I size={26} aria-hidden /> {t.title}</h1>
      <p className="ft-lead">{t.desc}</p>
      <section className="card ft-tool">{Body ? <Body /> : null}</section>
      <section className="ft-cta card">
        <div><b>Make the video, not just the plan.</b><span className="dim"> Edit in your browser, add captions and Hindi dubbing, and cut Shorts automatically.</span></div>
        <Link to="/signup" className="btn primary">Try the editor free</Link>
      </section>
      <section className="ft-group"><h2>More free tools</h2><div className="ft-grid">{more.map((x) => <Card key={x.slug} t={x} />)}</div></section>
    </main>
  );
}

// ---------------------------------------------------------------- small shared pieces
function CopyBtn({ text, label = "Copy" }: { text: string; label?: string }) {
  const [ok, setOk] = useState(false);
  return <button type="button" className="btn sm" disabled={!text} onClick={async () => {
    try { await navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1500); } catch { /* clipboard blocked: the text is selectable */ }
  }}>{ok ? <Check size={13} /> : <Copy size={13} />}{ok ? "Copied" : label}</button>;
}
function Out({ text, label }: { text: string; label?: string }) {
  return <div className="ft-out"><code>{text}</code><CopyBtn text={text} label={label} /></div>;
}
function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return <label className="ft-field"><span>{label}</span>{children}{hint && <small className="dim">{hint}</small>}</label>;
}
const n0 = (s: string) => Math.max(0, Number(s.replace(/[, ]/g, "")) || 0);
function Err({ msg }: { msg: string }) { return msg ? <p className="ft-err" role="alert">{msg}</p> : null; }

function useLookup<T>(path: (q: string) => string) {
  const [q, setQ] = useState(""), [busy, setBusy] = useState(false), [err, setErr] = useState(""), [data, setData] = useState<T | null>(null);
  const run = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!q.trim()) return;
    setBusy(true); setErr(""); setData(null);
    try { setData(await api<T>(path(q.trim()))); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  };
  return { q, setQ, busy, err, data, run };
}
function LookupForm({ l, placeholder, button, label }: { l: { q: string; setQ: (s: string) => void; busy: boolean; run: (e?: React.FormEvent) => void }; placeholder: string; button: string; label: string }) {
  return <form className="ft-row" onSubmit={l.run}>
    <input value={l.q} onChange={(e) => l.setQ(e.target.value)} placeholder={placeholder} aria-label={label} maxLength={300} />
    <button className="btn primary" disabled={l.busy || !l.q.trim()}>{l.busy ? "Working…" : button}</button>
  </form>;
}

type Channel = { id: string; title: string; url: string; rss: string; videos: { id: string; title: string; url: string; published_at: string; views: number }[] };
const channelPath = (q: string) => `/public/channel?ref=${encodeURIComponent(q)}`;

// ---------------------------------------------------------------- the tools
function Audit() {
  const tz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata"; } catch { return "Asia/Kolkata"; } })();
  const l = useLookup<Insights>((q) => `/public/audit?ref=${encodeURIComponent(q)}&tz=${encodeURIComponent(tz)}`);
  const d = l.data;
  return <>
    <LookupForm l={l} placeholder="youtube.com/@yourchannel" button="Audit channel" label="Channel link or @handle" />
    <Err msg={l.err} />
    {d && <div className="ft-res">
      <h3>{d.channel.title}</h3>
      {!d.enough_data ? <p>{d.message}</p> : <>
        <div className="ft-stats">
          {d.next_video && <div><span>Next video estimate</span><b>{num(d.next_video.low)} – {num(d.next_video.high)}</b><small>views · {d.next_video.confidence} confidence</small></div>}
          {d.summary && <div><span>Usual video</span><b>{num(d.summary.median_views)}</b><small>median views</small></div>}
          {d.summary?.upload_every_days != null && <div><span>Uploads every</span><b>{d.summary.upload_every_days} days</b><small>median gap</small></div>}
          {d.by_weekday?.[0] && <div><span>Best day</span><b>{d.by_weekday[0].label}</b><small>{d.by_weekday[0].vs_channel}× usual views</small></div>}
        </div>
        {!!d.tips?.length && <><h4><Lightbulb size={15} /> What works</h4><ul>{d.tips.map((x) => <li key={x}>{x}</li>)}</ul></>}
        {!!d.top_videos?.length && <><h4><TrendingUp size={15} /> Top videos</h4><ul>{d.top_videos.map((v) => <li key={v.id}><a href={`https://youtu.be/${v.id}`} target="_blank" rel="noreferrer noopener">{v.title}</a> — {num(v.views)} views ({v.vs_channel}×)</li>)}</ul></>}
        {!!d.by_time?.length && <p><CalendarClock size={14} /> Best upload time: <b>{d.by_time[0].label}</b> ({d.timezone})</p>}
      </>}
      <p className="dim ft-note">{d.method}</p>
    </div>}
  </>;
}

function Money() {
  const [views, setViews] = useState("100000"), [sp, setSp] = useState("30");
  const [l0, setL0] = useState("25"), [l1, setL1] = useState("100"), [s0, setS0] = useState("2"), [s1, setS1] = useState("8");
  const r = earnings(n0(views), Math.min(100, n0(sp)), [n0(l0), n0(l1)], [n0(s0), n0(s1)]);
  return <>
    <div className="ft-form">
      <Field label="Views per month"><input inputMode="numeric" value={views} onChange={(e) => setViews(e.target.value)} /></Field>
      <Field label="Share from Shorts (%)"><input inputMode="numeric" value={sp} onChange={(e) => setSp(e.target.value)} /></Field>
      <Field label="Long-video RPM (₹ per 1,000 views)" hint="What you receive after YouTube's share"><div className="ft-pair"><input inputMode="decimal" value={l0} onChange={(e) => setL0(e.target.value)} aria-label="Long RPM low" /><span>to</span><input inputMode="decimal" value={l1} onChange={(e) => setL1(e.target.value)} aria-label="Long RPM high" /></div></Field>
      <Field label="Shorts RPM (₹ per 1,000 views)"><div className="ft-pair"><input inputMode="decimal" value={s0} onChange={(e) => setS0(e.target.value)} aria-label="Shorts RPM low" /><span>to</span><input inputMode="decimal" value={s1} onChange={(e) => setS1(e.target.value)} aria-label="Shorts RPM high" /></div></Field>
    </div>
    <div className="ft-stats">
      <div><span>Per month</span><b>{inr(r.low)} – {inr(r.high)}</b></div>
      <div><span>Per year</span><b>{inr(r.low * 12)} – {inr(r.high * 12)}</b></div>
      <div><span>Per 1 lakh views</span><b>{inr(r.low / Math.max(n0(views), 1) * 1e5)} – {inr(r.high / Math.max(n0(views), 1) * 1e5)}</b></div>
    </div>
    <p className="dim ft-note">An estimate, not a promise. Your real RPM is in YouTube Studio → Analytics → Revenue; put it above for an accurate number. RPM changes a lot with niche (finance and tech pay more than entertainment), viewers' countries and the season. Only monetized channels earn ad revenue.</p>
  </>;
}

function Monet() {
  const [subs, setSubs] = useState(""), [hours, setHours] = useState(""), [shorts, setShorts] = useState(""), [ups, setUps] = useState("");
  const r = monetization({ subs: n0(subs), hours: n0(hours), shorts: n0(shorts), uploads: n0(ups) });
  const Tier = ({ name, what, t }: { name: string; what: string; t: { ok: boolean; missing: string[] } }) => (
    <div className={`ft-tier ${t.ok ? "ok" : ""}`}><div className="row" style={{ gap: 8 }}>{t.ok ? <Check size={18} /> : <X size={18} />}<b>{name}</b></div>
      <p className="dim">{what}</p>{t.ok ? <p>You meet the requirements — apply in YouTube Studio → Earn.</p> : <ul>{t.missing.map((m) => <li key={m}>{m}</li>)}</ul>}</div>);
  return <>
    <div className="ft-form">
      <Field label="Subscribers"><input inputMode="numeric" value={subs} onChange={(e) => setSubs(e.target.value)} /></Field>
      <Field label="Public watch hours (last 12 months)" hint="YouTube Studio → Earn shows this"><input inputMode="numeric" value={hours} onChange={(e) => setHours(e.target.value)} /></Field>
      <Field label="Shorts views (last 90 days)"><input inputMode="numeric" value={shorts} onChange={(e) => setShorts(e.target.value)} /></Field>
      <Field label="Public uploads (last 90 days)"><input inputMode="numeric" value={ups} onChange={(e) => setUps(e.target.value)} /></Field>
    </div>
    <div className="ft-tiers">
      <Tier name="Fan funding (early access)" what="Memberships, Super Thanks, Super Chat, Shopping" t={r.early} />
      <Tier name="Full Partner Programme" what="Ad revenue sharing and YouTube Premium revenue" t={r.full} />
    </div>
    <p className="dim ft-note">Thresholds from YouTube Help (expanded YouTube Partner Programme, available in India). You also need to follow YouTube's monetization policies, live in an eligible country, have 2-Step Verification on and no active Community Guidelines strikes.</p>
  </>;
}

function Engage() {
  const [v, setV] = useState("10000"), [l, setL] = useState("450"), [c, setC] = useState("60"), [s, setS] = useState("");
  const views = n0(v), rate = views ? 100 * (n0(l) + n0(c) + n0(s)) / views : 0;
  return <>
    <div className="ft-form">
      <Field label="Views"><input inputMode="numeric" value={v} onChange={(e) => setV(e.target.value)} /></Field>
      <Field label="Likes"><input inputMode="numeric" value={l} onChange={(e) => setL(e.target.value)} /></Field>
      <Field label="Comments"><input inputMode="numeric" value={c} onChange={(e) => setC(e.target.value)} /></Field>
      <Field label="Shares (optional)" hint="From YouTube Studio analytics"><input inputMode="numeric" value={s} onChange={(e) => setS(e.target.value)} /></Field>
    </div>
    <div className="ft-stats">
      <div><span>Engagement rate</span><b>{rate.toFixed(2)}%</b><small>(likes + comments{n0(s) ? " + shares" : ""}) ÷ views</small></div>
      <div><span>Likes per 100 views</span><b>{views ? (100 * n0(l) / views).toFixed(2) : "0"}</b></div>
      <div><span>Comments per 1,000 views</span><b>{views ? (1000 * n0(c) / views).toFixed(1) : "0"}</b></div>
    </div>
    <p className="dim ft-note">Compare a video with your own other videos rather than with other channels — rates differ a lot between niches, Shorts and long videos.</p>
  </>;
}

function Watch() {
  const [v, setV] = useState("50000"), [d, setD] = useState("3:30");
  const sec = parseTime(d), hours = sec == null ? 0 : n0(v) * sec / 3600;
  return <>
    <div className="ft-form">
      <Field label="Views"><input inputMode="numeric" value={v} onChange={(e) => setV(e.target.value)} /></Field>
      <Field label="Average view duration" hint="mm:ss, from YouTube Studio"><input value={d} onChange={(e) => setD(e.target.value)} /></Field>
    </div>
    {sec == null ? <Err msg="Write the duration like 3:30 or 1:02:00" /> : <div className="ft-stats">
      <div><span>Watch time</span><b>{Math.round(hours).toLocaleString("en-IN")} hours</b></div>
      <div><span>Toward 4,000 hours</span><b>{Math.min(100, hours / 40).toFixed(1)}%</b><small>{hours >= 4000 ? "reached" : `${Math.round(4000 - hours).toLocaleString("en-IN")} hours to go`}</small></div>
      <div><span>Toward 3,000 hours</span><b>{Math.min(100, hours / 30).toFixed(1)}%</b><small>fan-funding tier</small></div>
    </div>}
    <p className="dim ft-note">Only public long-video watch time from the last 12 months counts for the Partner Programme; Shorts feed views and private or deleted videos don't.</p>
  </>;
}

type Kw = { query: string; total: number; groups: { label: string; items: string[] }[] };
function Keywords() {
  const l = useLookup<Kw>((q) => `/public/keywords?q=${encodeURIComponent(q)}`);
  const all = l.data ? l.data.groups.flatMap((g) => g.items) : [];
  return <>
    <LookupForm l={l} placeholder="e.g. goa trip, study tips, mutual funds" button="Find keywords" label="Topic" />
    <Err msg={l.err} />
    {l.data && <div className="ft-res">
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}><b>{l.data.total} searches people make about “{l.data.query}”</b><CopyBtn text={all.join("\n")} label="Copy all" /></div>
      {l.data.groups.map((g) => <div key={g.label}><h4>{g.label}</h4><div className="ft-chips">{g.items.map((k) => <span key={k} className="badge">{k}</span>)}</div></div>)}
      <p className="dim ft-note">From YouTube's own search suggestions for India. Suggestions show what people search often; YouTube doesn't publish exact search volumes. Use these words in your title, description and first lines of the video.</p>
    </div>}
  </>;
}

function Hashtags() {
  const l = useLookup<Kw>((q) => `/public/keywords?q=${encodeURIComponent(q)}`);
  const tags = l.data ? hashtags([l.data.query, ...l.data.groups.flatMap((g) => g.items)]) : [];
  return <>
    <LookupForm l={l} placeholder="Your video topic, e.g. street food delhi" button="Make hashtags" label="Video topic" />
    <Err msg={l.err} />
    {l.data && <div className="ft-res">
      <div className="ft-chips">{tags.map((t) => <span key={t} className="badge ok">{t}</span>)}</div>
      <Out text={tags.join(" ")} label="Copy hashtags" />
      <p className="dim ft-note">Put 3–5 of the most relevant at the end of your description; the first three show above your title. YouTube ignores all hashtags on a video that has more than 60.</p>
    </div>}
  </>;
}

function ChannelId() {
  const l = useLookup<Channel>(channelPath);
  return <>
    <LookupForm l={l} placeholder="youtube.com/@channel or @handle" button="Find ID" label="Channel link or @handle" />
    <Err msg={l.err} />
    {l.data && <div className="ft-res"><h3>{l.data.title}</h3><Out text={l.data.id} label="Copy ID" /><Out text={l.data.url} label="Copy link" /></div>}
  </>;
}

function VideoLinks() {
  const l = useLookup<Channel>(channelPath);
  return <>
    <LookupForm l={l} placeholder="youtube.com/@channel or @handle" button="Get links" label="Channel link or @handle" />
    <Err msg={l.err} />
    {l.data && <div className="ft-res">
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}><b>{l.data.title}: latest {l.data.videos.length} uploads</b><CopyBtn text={l.data.videos.map((v) => v.url).join("\n")} label="Copy all links" /></div>
      <ol className="ft-list">{l.data.videos.map((v) => <li key={v.id}><a href={v.url} target="_blank" rel="noreferrer noopener">{v.title}</a> <span className="dim">· {num(v.views)} views</span></li>)}</ol>
      <p className="dim ft-note">YouTube's public feed lists a channel's newest 15 uploads.</p>
    </div>}
  </>;
}

function RssTool() {
  const l = useLookup<Channel>(channelPath);
  return <>
    <LookupForm l={l} placeholder="youtube.com/@channel or @handle" button="Get RSS link" label="Channel link or @handle" />
    <Err msg={l.err} />
    {l.data && <div className="ft-res"><h3>{l.data.title}</h3><Out text={l.data.rss} label="Copy RSS link" /><p className="dim ft-note">Paste this into any feed reader (Feedly, Inoreader, Outlook) to get every new upload.</p></div>}
  </>;
}

function Thumb() {
  const [u, setU] = useState("");
  const id = videoId(u);
  const sizes: [string, string][] = [["maxresdefault", "HD 1280×720"], ["sddefault", "SD 640×480"], ["hqdefault", "High 480×360"], ["mqdefault", "Medium 320×180"]];
  return <>
    <Field label="Video link"><input value={u} onChange={(e) => setU(e.target.value)} placeholder="youtube.com/watch?v=… or youtu.be/… or a Shorts link" /></Field>
    {u && !id && <Err msg="That doesn't look like a YouTube video link" />}
    {id && <div className="ft-thumbs">{sizes.map(([k, label]) => <ThumbItem key={k} src={`https://i.ytimg.com/vi/${id}/${k}.jpg`} label={label} />)}</div>}
    <p className="dim ft-note">Open a size, then right-click → Save image (on phones, long-press). Thumbnails belong to the video's creator: use other creators' thumbnails only for reference, not in your own videos.</p>
  </>;
}
function ThumbItem({ src, label }: { src: string; label: string }) {
  const [bad, setBad] = useState(false);
  if (bad) return null;
  return <a className="ft-thumb" href={src} target="_blank" rel="noreferrer noopener">
    <img src={src} alt={label} loading="lazy" referrerPolicy="no-referrer" onError={() => setBad(true)} onLoad={(e) => { if ((e.target as HTMLImageElement).naturalWidth <= 120) setBad(true); }} />
    <span>{label} <ExternalLink size={12} /></span></a>;
}

function Stamp() {
  const [u, setU] = useState(""), [t, setT] = useState("1:30");
  const id = videoId(u), s = parseTime(t);
  return <>
    <div className="ft-form">
      <Field label="Video link"><input value={u} onChange={(e) => setU(e.target.value)} placeholder="youtube.com/watch?v=…" /></Field>
      <Field label="Start at" hint="h:mm:ss, mm:ss or seconds"><input value={t} onChange={(e) => setT(e.target.value)} /></Field>
    </div>
    {u && !id && <Err msg="That doesn't look like a YouTube video link" />}
    {s == null && <Err msg="Write the time like 1:30 or 1:02:03" />}
    {id && s != null && <Out text={`https://youtu.be/${id}${s ? `?t=${s}` : ""}`} label="Copy link" />}
  </>;
}

function Subscribe() {
  const [c, setC] = useState("");
  const link = useMemo(() => {
    const t = c.trim();
    const uc = t.match(/(UC[0-9A-Za-z_-]{22})/), h = t.match(/@([A-Za-z0-9._-]{3,30})/) ?? (/^[A-Za-z0-9._-]{3,30}$/.test(t) ? [t, t] : null);
    if (uc) return `https://www.youtube.com/channel/${uc[1]}?sub_confirmation=1`;
    if (h) return `https://www.youtube.com/@${h[1]}?sub_confirmation=1`;
    return "";
  }, [c]);
  return <>
    <Field label="Your channel link or @handle"><input value={c} onChange={(e) => setC(e.target.value)} placeholder="youtube.com/@yourchannel" /></Field>
    {c.trim() && !link && <Err msg="Paste your channel link (youtube.com/@name or youtube.com/channel/UC…) or your @handle" />}
    {link && <><Out text={link} label="Copy link" /><p className="dim ft-note">Anyone who opens this link sees your channel with the “Subscribe?” confirmation already open. Use it in bios, descriptions and WhatsApp.</p></>}
  </>;
}

function Embed() {
  const [u, setU] = useState(""), [t, setT] = useState(""), [auto, setAuto] = useState(false), [loop, setLoop] = useState(false), [mute, setMute] = useState(false), [ctl, setCtl] = useState(true), [nc, setNc] = useState(true);
  const id = videoId(u), s = parseTime(t);
  const code = useMemo(() => {
    if (!id) return "";
    const p = new URLSearchParams();
    if (s) p.set("start", String(s));
    if (auto) p.set("autoplay", "1");
    if (auto || mute) p.set("mute", "1");
    if (loop) { p.set("loop", "1"); p.set("playlist", id); }
    if (!ctl) p.set("controls", "0");
    const q = p.toString();
    return `<iframe width="560" height="315" src="https://www.youtube${nc ? "-nocookie" : ""}.com/embed/${id}${q ? "?" + q : ""}" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`;
  }, [id, s, auto, loop, mute, ctl, nc]);
  return <>
    <div className="ft-form">
      <Field label="Video link"><input value={u} onChange={(e) => setU(e.target.value)} placeholder="youtube.com/watch?v=…" /></Field>
      <Field label="Start at (optional)"><input value={t} onChange={(e) => setT(e.target.value)} placeholder="0:45" /></Field>
    </div>
    <div className="ft-checks">
      <label><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Autoplay (starts muted)</label>
      <label><input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} /> Loop</label>
      <label><input type="checkbox" checked={mute} onChange={(e) => setMute(e.target.checked)} /> Muted</label>
      <label><input type="checkbox" checked={ctl} onChange={(e) => setCtl(e.target.checked)} /> Show controls</label>
      <label><input type="checkbox" checked={nc} onChange={(e) => setNc(e.target.checked)} /> Privacy-enhanced (no cookies until play)</label>
    </div>
    {u && !id && <Err msg="That doesn't look like a YouTube video link" />}
    {s == null && <Err msg="Write the time like 0:45" />}
    {code && <Out text={code} label="Copy code" />}
  </>;
}

const BODIES: Record<string, () => JSX.Element> = {
  "youtube-channel-audit": Audit, "youtube-money-calculator": Money, "youtube-monetization-checker": Monet,
  "youtube-engagement-calculator": Engage, "youtube-watch-time-calculator": Watch, "youtube-keyword-research": Keywords,
  "youtube-hashtag-generator": Hashtags, "youtube-channel-id-finder": ChannelId, "youtube-channel-video-links": VideoLinks,
  "youtube-rss-feed-generator": RssTool, "youtube-thumbnail-downloader": Thumb, "youtube-timestamp-link-generator": Stamp,
  "youtube-subscribe-link-generator": Subscribe, "youtube-embed-code-generator": Embed,
};
