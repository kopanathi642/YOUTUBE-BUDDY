import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Youtube, Link2, RefreshCw, TrendingUp, TrendingDown, Lightbulb, CalendarClock, Clock, Ruler, Type, Info } from "lucide-react";
import { api } from "../api";
import { useAuth, useToast } from "../App";
import UniverseShell from "../components/UniverseShell";
import { ytStatus } from "../components/ChannelButton";
import type { YtStatus } from "../components/YouTubeCard";

type Row = { label: string; videos: number; median_views: number; vs_channel: number | null };
type Vid = { id: string; title: string; published_at: string; thumbnail: string | null; duration_s: number; views: number; likes: number; comments: number; engagement: number; format: string; age_days: number };
export type Insights = {
  channel: { id: string; title: string; thumbnail: string | null; subscribers: number | null; views: number; videos: number };
  timezone: string; analysed_videos: number; mature_videos: number; enough_data: boolean; message?: string; method: string; fetched_at: string;
  recent: Vid[];
  summary?: { median_views: number; p25_views: number; p75_views: number; median_engagement: number; upload_every_days: number | null };
  by_weekday?: Row[]; by_time?: Row[]; by_length?: Row[]; by_format?: Row[];
  title_words?: { strong: { word: string; videos: number; vs_channel: number }[]; weak: { word: string; videos: number; vs_channel: number }[] };
  top_videos?: { id: string; title: string; views: number; vs_channel: number | null }[];
  next_video?: { format: string; based_on: number; low: number; typical: number; high: number; window_days: number; confidence: string; trend: number | null };
  tips?: string[]; ideas?: string[];
};
const MSG: Record<string, string> = { connected: "YouTube channel connected", denied: "YouTube connection was cancelled", bad_state: "That sign-in link expired — try again",
  no_refresh: "Google didn't grant offline access — remove the app at myaccount.google.com/permissions and connect again", failed: "Couldn't connect YouTube — try again" };

export const num = (n: number | null | undefined) => n == null ? "—" : n >= 1e7 ? `${(n / 1e7).toFixed(1)} Cr` : n >= 1e5 ? `${(n / 1e5).toFixed(1)} L` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(Math.round(n));
const dur = (s: number) => s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

function Bars({ title, icon, rows }: { title: string; icon: React.ReactNode; rows?: Row[] }) {
  if (!rows?.length) return null;
  const max = Math.max(...rows.map((r) => r.median_views), 1);
  return (
    <section className="card ch-card">
      <div className="row ch-h">{icon}<b>{title}</b></div>
      {rows.slice(0, 7).map((r, i) => (
        <div key={r.label} className="ch-bar">
          <span className="ch-bar-l">{r.label}</span>
          <span className="ch-bar-t"><span className={`ch-bar-f ${i === 0 ? "best" : ""}`} style={{ width: `${Math.max(4, 100 * r.median_views / max)}%` }} /></span>
          <span className="ch-bar-v">{num(r.median_views)} <span className="dim">· {r.videos}</span></span>
        </div>
      ))}
      <div className="dim ch-foot">Median views per video · number of videos</div>
    </section>
  );
}

export default function Channel() {
  const { me } = useAuth();
  const toast = useToast();
  const [st, setSt] = useState<YtStatus | null | undefined>(undefined);
  const [d, setD] = useState<Insights | null>(null), [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  const tz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata"; } catch { return "Asia/Kolkata"; } })();
  const load = useCallback(async (refresh = false) => {
    setBusy(true); setErr("");
    try { setD(await api<Insights>(`/youtube/insights?tz=${encodeURIComponent(tz)}${refresh ? "&refresh=true" : ""}`)); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }, [tz]);
  useEffect(() => {
    const r = new URLSearchParams(location.search).get("youtube");
    if (r && MSG[r]) { toast(MSG[r]); history.replaceState(null, "", location.pathname); }
    ytStatus(!!r).then((s) => { setSt(s); if (s?.connected) load(); });
  }, [load]); // eslint-disable-line react-hooks/exhaustive-deps
  async function connect() {
    setBusy(true);
    try { const { url } = await api<{ url: string }>("/youtube/connect?back=channel"); location.assign(url); }
    catch (e) { toast((e as Error).message); setBusy(false); }
  }

  return (
    <UniverseShell u={null}>
      <div className="page-h"><div><h1 className="row" style={{ gap: 10 }}><Youtube size={26} color="#ff3b3b" />My channel</h1>
        <div className="muted">Understand what works on your channel and what to expect from your next video.</div></div>
        {st?.connected && <button className="btn" onClick={() => load(true)} disabled={busy}><RefreshCw size={14} className={busy ? "spin" : ""} />Refresh</button>}
      </div>

      {st === undefined && <div className="spinner" />}
      {st === null && <div className="card empty">Couldn't check your YouTube connection. Try again in a moment.</div>}
      {st && !st.configured && <div className="card ch-card"><b>YouTube isn't set up on this server yet.</b>
        <div className="dim" style={{ marginTop: 6, fontSize: 13 }}>{me?.is_platform_admin ? <>Add {st.missing.join(", ")} to the server's environment (see docs/GO_LIVE_GOOGLE.md). Authorised redirect URI: <span className="mono">{st.redirect_uri}</span></> : "It will appear here as soon as it's available."}</div></div>}
      {st?.configured && !st.connected && <div className="card ch-connect">
        <Youtube size={44} color="#ff3b3b" />
        <h2>Connect your YouTube channel</h2>
        <p className="dim">We read your own channel's public numbers (views, likes, comments, upload times) to show what works and estimate your next video's views.
          The same connection lets you publish exports straight to YouTube. We store an encrypted access key — never your password — and you can disconnect any time in Settings.</p>
        <button className="btn primary" onClick={connect} disabled={busy}><Link2 size={15} />Connect with Google</button>
      </div>}

      {err && <div className="card empty" role="alert">{err}</div>}
      {st?.connected && !d && !err && <div className="proj-grid">{[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 140 }} />)}</div>}
      {d && <>
        <section className="card ch-head">
          {d.channel.thumbnail ? <img src={d.channel.thumbnail} alt="" className="ch-avatar" referrerPolicy="no-referrer" /> : <Youtube size={40} color="#ff3b3b" />}
          <div className="grow"><h2 style={{ margin: 0 }}>{d.channel.title}</h2>
            <a className="dim" style={{ fontSize: 12 }} href={`https://www.youtube.com/channel/${d.channel.id}`} target="_blank" rel="noreferrer noopener">Open on YouTube ↗</a></div>
          <div className="ch-stat"><b>{d.channel.subscribers == null ? "hidden" : num(d.channel.subscribers)}</b><span>subscribers</span></div>
          <div className="ch-stat"><b>{num(d.channel.views)}</b><span>total views</span></div>
          <div className="ch-stat"><b>{num(d.channel.videos)}</b><span>videos</span></div>
        </section>

        {!d.enough_data ? <div className="card ch-card"><Info size={16} /> {d.message}</div> : <>
          <div className="ch-grid">
            {d.next_video && <section className="card ch-card ch-pred">
              <div className="row ch-h"><TrendingUp size={16} /><b>Next video estimate</b><span className={`badge ${d.next_video.confidence === "fair" ? "ok" : ""}`} style={{ marginLeft: "auto" }}>{d.next_video.confidence} confidence</span></div>
              <div className="ch-big">{num(d.next_video.low)} – {num(d.next_video.high)} <span>views</span></div>
              <div className="dim" style={{ fontSize: 13 }}>Typical: <b>{num(d.next_video.typical)}</b> for your next {d.next_video.format.toLowerCase()}, from your last {d.next_video.based_on} of them (middle half of results).</div>
              {d.next_video.trend != null && <div className="row" style={{ fontSize: 13, marginTop: 8, gap: 6 }}>{d.next_video.trend >= 1 ? <TrendingUp size={14} color="#4ade80" /> : <TrendingDown size={14} color="#fb7185" />}
                Recent videos get {d.next_video.trend}× the views of earlier ones.</div>}
            </section>}
            {d.summary && <section className="card ch-card">
              <div className="row ch-h"><CalendarClock size={16} /><b>Your usual video</b></div>
              <div className="gb-kv"><span>Median views</span><b>{num(d.summary.median_views)}</b></div>
              <div className="gb-kv"><span>Middle half</span><b>{num(d.summary.p25_views)} – {num(d.summary.p75_views)}</b></div>
              <div className="gb-kv"><span>Likes + comments per 100 views</span><b>{d.summary.median_engagement}</b></div>
              <div className="gb-kv"><span>Uploads every</span><b>{d.summary.upload_every_days != null ? `${d.summary.upload_every_days} days` : "—"}</b></div>
            </section>}
          </div>

          {!!d.tips?.length && <section className="card ch-card">
            <div className="row ch-h"><Lightbulb size={16} /><b>What works on your channel</b></div>
            <ul className="ch-tips">{d.tips.map((t) => <li key={t}>{t}</li>)}</ul>
            {!!d.ideas?.length && <><div className="side-h" style={{ padding: "10px 0 4px" }}>Next video ideas</div>
              <ul className="ch-tips">{d.ideas.map((t) => <li key={t}>{t}</li>)}</ul></>}
            <Link to="/ai-generator" className="btn sm" style={{ marginTop: 8 }}>Write titles &amp; scripts in AI Generator</Link>
          </section>}

          <div className="ch-grid">
            <Bars title="Best upload day" icon={<CalendarClock size={16} />} rows={d.by_weekday} />
            <Bars title={`Best upload time (${d.timezone})`} icon={<Clock size={16} />} rows={d.by_time} />
            <Bars title="Video length" icon={<Ruler size={16} />} rows={d.by_length} />
            {d.title_words && d.title_words.strong.length > 0 && <section className="card ch-card">
              <div className="row ch-h"><Type size={16} /><b>Title words</b></div>
              <div className="ch-chips">{d.title_words.strong.map((w) => <span key={w.word} className="badge ok" title={`${w.videos} videos`}>{w.word} {w.vs_channel}×</span>)}</div>
              {d.title_words.weak.length > 0 && <><div className="dim" style={{ fontSize: 12, margin: "10px 0 4px" }}>Below your usual</div>
                <div className="ch-chips">{d.title_words.weak.map((w) => <span key={w.word} className="badge" title={`${w.videos} videos`}>{w.word} {w.vs_channel}×</span>)}</div></>}
            </section>}
          </div>
        </>}

        <section className="card ch-card">
          <div className="row ch-h"><Youtube size={16} color="#ff3b3b" /><b>Recent uploads</b></div>
          <div className="ch-vids">{d.recent.map((v) => (
            <a key={v.id} className="ch-vid" href={`https://youtu.be/${v.id}`} target="_blank" rel="noreferrer noopener">
              <div className="ch-thumb">{v.thumbnail && <img src={v.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" />}<span>{v.format === "short" ? "Short" : dur(v.duration_s)}</span></div>
              <div className="ch-vt">{v.title}</div>
              <div className="dim" style={{ fontSize: 11.5 }}>{num(v.views)} views · {v.age_days < 1 ? "today" : `${Math.round(v.age_days)} d ago`}{v.age_days < 3 && " · still counting"}</div>
            </a>))}
          </div>
        </section>
        <div className="dim" style={{ fontSize: 12, margin: "8px 2px 30px" }}><Info size={12} /> {d.method} Updated {new Date(d.fetched_at).toLocaleTimeString()}.</div>
      </>}
    </UniverseShell>
  );
}
