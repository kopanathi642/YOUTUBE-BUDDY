import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Rocket, LayoutDashboard, Sparkles, MessageCircle, Brain, Users, CalendarDays, Bot, Send, BarChart3, BookOpen, Plus, RefreshCw, Trash2,
  Info, ExternalLink, Play, Check, Wand2, ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "../api";
import { useAuth, useToast } from "../App";
import UniverseShell from "../components/UniverseShell";
import { num } from "./Channel";
import "../growth.css";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Item = { id: string; title: string; format: "long" | "short"; status: string; series: string | null; scheduled_at: string | null; recommendation: any; blueprint: any;
  project_id: string | null; youtube_video_id: string | null; prediction: any; outcome: any; notes: string | null; unfinished: string[]; updated_at: string };

const TABS = [
  { id: "overview", label: "Growth overview", icon: LayoutDashboard },
  { id: "next", label: "Next video", icon: Sparkles },
  { id: "coach", label: "Growth coach", icon: MessageCircle },
  { id: "intel", label: "Content intelligence", icon: Brain },
  { id: "competitors", label: "Competitor research", icon: Users },
  { id: "calendar", label: "Content calendar", icon: CalendarDays },
  { id: "automation", label: "Automation center", icon: Bot },
  { id: "publish", label: "Publishing studio", icon: Send },
  { id: "performance", label: "Performance", icon: BarChart3 },
  { id: "library", label: "Strategy library", icon: BookOpen },
] as const;
const STATUSES = ["idea", "research", "script", "production", "review", "approved", "scheduled", "published"];
const W_LABEL: Record<string, string> = { relevance: "Fits your channel", history: "Your past results", demand: "Audience demand", difference: "Room to stand out", feasibility: "Easy to make", consistency: "Keeps your rhythm" };

function useWs() {
  const { workspace } = useAuth();
  return workspace?.id ?? "";
}

function Note({ children }: { children: React.ReactNode }) {
  return <div className="gr-note"><Info size={13} /> <span>{children}</span></div>;
}

/* --------------------------------------------------------------------------- channels */
function AddChannel({ ws, role, onDone }: { ws: string; role: "own" | "competitor"; onDone: () => void }) {
  const toast = useToast();
  const [ref, setRef] = useState(""), [busy, setBusy] = useState(false);
  async function add(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try { await api("/growth/channels", { method: "POST", body: { workspace_id: ws, ref, role } }); setRef(""); toast("Channel added"); onDone(); }
    catch (x) { toast((x as Error).message); } finally { setBusy(false); }
  }
  return (
    <form className="gr-add" onSubmit={add}>
      <input className="input" value={ref} onChange={(e) => setRef(e.target.value)} placeholder={role === "own" ? "Your channel ID (UC…) or youtube.com/channel/UC… link" : "Competitor channel ID (UC…) or link"} aria-label="Channel ID or link" />
      <button className="btn primary" disabled={busy || ref.trim().length < 3}><Plus size={14} />{role === "own" ? "Set my channel" : "Track"}</button>
    </form>
  );
}

/* --------------------------------------------------------------------------- overview */
function Overview({ ws, ov, reload, go }: { ws: string; ov: any; reload: () => void; go: (t: string) => void }) {
  const own = ov.channels.find((c: any) => c.role === "own");
  return <>
    {!own && <section className="card gr-card">
      <h3>Start with your channel</h3>
      <p className="dim">Paste your channel ID. We read its public uploads feed (titles, dates, view counts of the latest 15 videos) — no sign-in needed.
        Find it on YouTube: your channel → About → Share channel → Copy channel ID.</p>
      <AddChannel ws={ws} role="own" onDone={reload} />
    </section>}
    <div className="gr-stats">
      <div className="card gr-stat"><b>{ov.channels.length}</b><span>channels tracked</span></div>
      <div className="card gr-stat"><b>{ov.own_recent.length}</b><span>of your uploads measured</span></div>
      <div className="card gr-stat"><b>{STATUSES.slice(0, 5).reduce((a, s) => a + (ov.pipeline[s] || 0), 0)}</b><span>videos in progress</span></div>
      <div className="card gr-stat"><b>{ov.pipeline.published || 0}</b><span>published from here</span></div>
    </div>
    <div className="gr-grid">
      <section className="card gr-card">
        <h3>Your best recent uploads <span className="dim">(views per day)</span></h3>
        {ov.own_top.length ? ov.own_top.map((v: any) => <a key={v.video_id} className="gr-row" href={v.url} target="_blank" rel="noreferrer noopener">
          <span className="grow">{v.title}</span><b>{num(v.vpd)}/day</b><span className="dim">{num(v.views)}</span></a>) : <div className="dim">Add your channel to see this.</div>}
      </section>
      <section className="card gr-card">
        <h3>Pipeline</h3>
        <div className="gr-pipe">{STATUSES.map((s) => <button key={s} className="gr-pipe-s" onClick={() => go("publish")}><b>{ov.pipeline[s] || 0}</b><span>{s}</span></button>)}</div>
        <h3 style={{ marginTop: 14 }}>Coming up</h3>
        {ov.upcoming.length ? ov.upcoming.map((i: Item) => <div key={i.id} className="gr-row"><span className="grow">{i.title}</span><span className="dim">{new Date(i.scheduled_at!).toLocaleString()}</span></div>)
          : <div className="dim">Nothing scheduled. <button className="linklike" onClick={() => go("next")}>Pick your next video →</button></div>}
      </section>
    </div>
    <section className="card gr-card">
      <h3>Automation: <span className="badge">{ov.automation.mode}</span> {ov.automation.publish_authorized && <span className="badge ok">publishing authorised</span>}</h3>
      <div className="dim">Change what runs on its own in the <button className="linklike" onClick={() => go("automation")}>Automation center</button>.</div>
    </section>
    <Note>{ov.data_note}</Note>
  </>;
}

/* --------------------------------------------------------------------------- next video */
function NextVideo({ ws, onPlanned }: { ws: string; onPlanned: () => void }) {
  const toast = useToast();
  const [d, setD] = useState<any>(null), [err, setErr] = useState("");
  useEffect(() => { api(`/growth/recommendations?workspace_id=${ws}`).then(setD).catch((e) => setErr(e.message)); }, [ws]);
  async function plan(c: any, title: string) {
    try { await api("/growth/items", { method: "POST", body: { workspace_id: ws, title, format: c.format, recommendation: c } }); toast("Added to your plan"); onPlanned(); }
    catch (e) { toast((e as Error).message); }
  }
  if (err) return <div className="card empty">{err}</div>;
  if (!d) return <div className="spinner" />;
  if (!d.candidates.length) return <div className="card empty">Not enough data yet. Add your channel and two or three competitors, then come back.</div>;
  return <>
    <Note>{d.method} Based on {d.data.own_videos} of your videos and {d.data.competitor_videos} competitor videos.</Note>
    {d.candidates.map((c: any, i: number) => <section key={c.topic + i} className="card gr-card gr-rec">
      <div className="row" style={{ gap: 8 }}><span className="gr-score">{Math.round(c.score)}</span>
        <div className="grow"><h3 style={{ margin: 0 }}>{c.topic}</h3>
          <div className="dim">{c.format === "short" ? "Short" : "Long video"} · {c.audience} · best window {c.publish_window} · {c.complexity} effort</div></div>
        <span className={`badge ${c.confidence === "fair" ? "ok" : ""}`}>{c.confidence} confidence</span></div>
      <div className="gr-parts">{Object.entries(c.parts).map(([k, v]) => <div key={k} className="gr-part" title={`weight ${c.weights[k]}`}>
        <span>{W_LABEL[k] ?? k}</span><span className="gr-bar"><span style={{ width: `${v}%` }} /></span><b>{v as number}</b></div>)}</div>
      <ul className="gr-ev">{c.evidence.map((e: any) => <li key={e.text}><span className={`badge ${e.kind}`}>{e.kind}</span> {e.text}</li>)}</ul>
      <div className="gr-titles">{c.title_suggestions.map((t: string) => <button key={t} className="btn sm" onClick={() => plan(c, t)} title="Add to plan with this title"><Plus size={12} />{t}</button>)}</div>
    </section>)}
  </>;
}

/* --------------------------------------------------------------------------- coach */
function Coach({ ws }: { ws: string }) {
  const [q, setQ] = useState(""), [busy, setBusy] = useState(false), [log, setLog] = useState<{ q: string; a?: any; err?: string }[]>([]);
  async function ask(e: React.FormEvent) {
    e.preventDefault(); if (!q.trim()) return;
    const question = q; setQ(""); setBusy(true);
    try { const a = await api("/growth/coach", { method: "POST", body: { workspace_id: ws, question } }); setLog((l) => [...l, { q: question, a }]); }
    catch (x) { setLog((l) => [...l, { q: question, err: (x as Error).message }]); } finally { setBusy(false); }
  }
  return <>
    <Note>The coach answers from your channel's measured data only, shows its evidence, and never promises views.</Note>
    {log.map((m, i) => <section key={i} className="card gr-card">
      <div className="gr-q">{m.q}</div>
      {m.err && <div className="dim" role="alert">{m.err}</div>}
      {m.a && <><p>{m.a.answer}</p>
        {(m.a.recommendations || []).map((r: any, j: number) => <div key={j} className="gr-coach-r">
          <b>{r.recommendation}</b> <span className="badge">{r.confidence}</span>
          <div className="dim"><b>Evidence:</b> {r.evidence}</div><div className="dim"><b>Why:</b> {r.reasoning}</div>
          <div className="dim"><b>Do:</b> {r.action} · <b>Measure:</b> {r.measure}</div></div>)}
        <div className="dim" style={{ fontSize: 11 }}>{m.a.model}</div></>}
    </section>)}
    <form className="gr-add" onSubmit={ask}>
      <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask: why did my last video do worse? What should I post this week?" maxLength={1000} aria-label="Question for the coach" />
      <button className="btn primary" disabled={busy || q.trim().length < 3}>{busy ? <RefreshCw size={14} className="spin" /> : <MessageCircle size={14} />}Ask</button>
    </form>
  </>;
}

/* --------------------------------------------------------------------------- content intelligence */
function Intel({ ov, perf }: { ov: any; perf: any }) {
  const ins = ov.youtube_insights;
  const learn = Object.entries(perf?.learning || {}) as [string, number][];
  return <>
    {ins?.title_words ? <section className="card gr-card"><h3>Title words on your channel <span className="dim">(YouTube API)</span></h3>
      <div className="ch-chips">{ins.title_words.strong.map((w: any) => <span key={w.word} className="badge ok">{w.word} {w.vs_channel}×</span>)}</div>
      {ins.title_words.weak.length > 0 && <div className="ch-chips" style={{ marginTop: 8 }}>{ins.title_words.weak.map((w: any) => <span key={w.word} className="badge">{w.word} {w.vs_channel}×</span>)}</div>}
      <div className="dim" style={{ marginTop: 8 }}>Full breakdown by day, time and length: <Link to="/channel">My channel</Link></div></section>
      : <section className="card gr-card"><h3>Deeper insights</h3><div className="dim">Connect YouTube on <Link to="/channel">My channel</Link> to add likes, comments, durations and upload-time analysis. Retention, CTR and watch time need YouTube Analytics access, which isn't connected yet.</div></section>}
    <section className="card gr-card"><h3>Views per day, your recent uploads</h3>
      {ov.own_recent.length ? <div className="gr-bars">{[...ov.own_recent].reverse().map((v: any) => {
        const max = Math.max(...ov.own_recent.map((x: any) => x.vpd), 1);
        return <a key={v.video_id} href={v.url} target="_blank" rel="noreferrer noopener" className="gr-vbar" title={`${v.title}\n${num(v.vpd)} views/day · ${num(v.views)} views`}>
          <span style={{ height: `${Math.max(3, 100 * v.vpd / max)}%` }} /></a>; })}</div> : <div className="dim">No data yet.</div>}
      <div className="dim" style={{ fontSize: 12 }}>Oldest → newest. Hover a bar for the video.</div></section>
    <section className="card gr-card"><h3>What the system has learned</h3>
      {learn.length ? <div className="ch-chips">{learn.map(([w, f]) => <span key={w} className={`badge ${f >= 1 ? "ok" : ""}`}>{w} {f}× estimate</span>)}</div>
        : <div className="dim">After videos published from here are 7 days old, their results are compared with the estimate and topic weights adjust.</div>}</section>
  </>;
}

/* --------------------------------------------------------------------------- competitors */
function Competitors({ ws }: { ws: string }) {
  const toast = useToast();
  const [d, setD] = useState<any>(null);
  const load = useCallback(() => api(`/growth/competitors?workspace_id=${ws}`).then(setD).catch((e) => toast(e.message)), [ws, toast]);
  useEffect(() => { load(); }, [load]);
  async function sync(id: string) { try { await api(`/growth/channels/${id}/sync`, { method: "POST" }); load(); } catch (e) { toast((e as Error).message); } }
  async function del(id: string) { try { await api(`/growth/channels/${id}`, { method: "DELETE" }); load(); } catch (e) { toast((e as Error).message); } }
  return <>
    <section className="card gr-card"><h3>Track a channel</h3><AddChannel ws={ws} role="competitor" onDone={load} /></section>
    {!d ? <div className="spinner" /> : d.channels.map((c: any) => <section key={c.id} className="card gr-card">
      <div className="row" style={{ gap: 8 }}><h3 className="grow" style={{ margin: 0 }}>{c.title} {c.role === "own" && <span className="badge ok">you</span>}</h3>
        <a className="btn sm ghost" href={c.url} target="_blank" rel="noreferrer noopener"><ExternalLink size={13} /></a>
        <button className="btn sm ghost" onClick={() => sync(c.id)} title="Refresh"><RefreshCw size={13} /></button>
        <button className="btn sm ghost" onClick={() => del(c.id)} title="Stop tracking"><Trash2 size={13} /></button></div>
      {c.sync_error && <div className="dim" role="alert">{c.sync_error}</div>}
      <div className="gr-kv"><span>Typical views per day</span><b>{num(c.median_views_per_day)}</b><span>Uploads every</span><b>{c.upload_every_days ?? "—"} days</b>
        <span>Shorts share</span><b>{c.shorts_share != null ? `${Math.round(c.shorts_share * 100)}%` : "—"}</b></div>
      <div className="ch-chips">{c.frequent_words.map((w: string) => <span key={w} className="badge">{w}</span>)}</div>
      {c.top.slice(0, 3).map((v: any) => <a key={v.video_id} className="gr-row" href={v.url} target="_blank" rel="noreferrer noopener"><span className="grow">{v.title}</span><b>{num(v.vpd)}/day</b></a>)}
    </section>)}
    {d && <Note>{d.note} Learn from their topics and formats — make your own original take, never copy.</Note>}
  </>;
}

/* --------------------------------------------------------------------------- calendar */
function Calendar({ items, patch }: { items: Item[]; patch: (id: string, b: any) => void }) {
  const [m, setM] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const days = useMemo(() => {
    const start = new Date(m); start.setDate(1 - ((m.getDay() + 6) % 7));
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  }, [m]);
  const key = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const byDay = useMemo(() => { const o: Record<string, Item[]> = {}; items.forEach((i) => { if (i.scheduled_at) { const k = key(new Date(i.scheduled_at)); (o[k] ||= []).push(i); } }); return o; }, [items]);
  function drop(e: React.DragEvent, d: Date) {
    e.preventDefault(); const id = e.dataTransfer.getData("text/item"); if (!id) return;
    const it = items.find((x) => x.id === id); const old = it?.scheduled_at ? new Date(it.scheduled_at) : null;
    const t = new Date(d); t.setHours(old ? old.getHours() : 18, old ? old.getMinutes() : 0, 0, 0);
    patch(id, { scheduled_at: t.toISOString() });
  }
  const chip = (i: Item) => <div key={i.id} className={`gr-chip s-${i.status}`} draggable onDragStart={(e) => e.dataTransfer.setData("text/item", i.id)} title={`${i.title} — ${i.status}`}>{i.format === "short" ? "▮ " : ""}{i.title}</div>;
  const unscheduled = items.filter((i) => !i.scheduled_at && i.status !== "published");
  return <>
    <div className="row" style={{ gap: 8, marginBottom: 8 }}>
      <button className="btn sm ghost" onClick={() => setM(new Date(m.getFullYear(), m.getMonth() - 1, 1))} aria-label="Previous month"><ChevronLeft size={14} /></button>
      <b style={{ minWidth: 140, textAlign: "center" }}>{m.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</b>
      <button className="btn sm ghost" onClick={() => setM(new Date(m.getFullYear(), m.getMonth() + 1, 1))} aria-label="Next month"><ChevronRight size={14} /></button>
      <span className="dim" style={{ marginLeft: "auto", fontSize: 12 }}>Drag videos onto a day to schedule them.</span></div>
    <div className="gr-cal">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="gr-cal-h">{d}</div>)}
      {days.map((d) => <div key={key(d)} className={`gr-cal-d ${d.getMonth() !== m.getMonth() ? "out" : ""} ${key(d) === key(new Date()) ? "today" : ""}`}
        onDragOver={(e) => e.preventDefault()} onDrop={(e) => drop(e, d)}><span className="gr-cal-n">{d.getDate()}</span>{(byDay[key(d)] || []).map(chip)}</div>)}</div>
    <section className="card gr-card" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData("text/item"); if (id) patch(id, { clear_schedule: true }); }}>
      <h3>Not scheduled yet <span className="dim">(drop here to unschedule)</span></h3>
      <div className="gr-unsched">{unscheduled.length ? unscheduled.map(chip) : <span className="dim">Everything is on the calendar.</span>}</div></section>
  </>;
}

/* --------------------------------------------------------------------------- automation */
const MOD_LABEL: Record<string, string> = { research: "Refresh tracked channels every 2 hours", recommend: "Add suggested ideas to the plan (Semi/Autonomous)",
  script: "Draft scripts for new ideas (Semi/Autonomous)", edit: "Assemble videos: voice, scene cards, captions, thumbnail (Autonomous)",
  performance: "Measure views of published videos (day 1/3/7/30)", learning: "Learn from results to re-weight ideas" };
function Automation({ ws, canAdmin }: { ws: string; canAdmin: boolean }) {
  const toast = useToast();
  const [a, setA] = useState<any>(null);
  const load = useCallback(() => api(`/growth/automation?workspace_id=${ws}`).then(setA).catch((e) => toast(e.message)), [ws, toast]);
  useEffect(() => { load(); }, [load]);
  async function put(b: any) { try { setA(await api("/growth/automation", { method: "PUT", body: { workspace_id: ws, ...b } })); } catch (e) { toast((e as Error).message); } }
  async function run() { try { await api(`/growth/automation/run?workspace_id=${ws}`, { method: "POST" }); toast("Cycle started"); setTimeout(load, 2500); } catch (e) { toast((e as Error).message); } }
  if (!a) return <div className="spinner" />;
  const MODES = [["assisted", "Assisted", "Suggestions only. You do every step."], ["semi", "Semi-automatic", "Keeps ideas and script drafts ready. You produce and approve."],
    ["autonomous", "Autonomous", "Also assembles videos. Every video still waits in Review for your approval."]];
  return <>
    {!canAdmin && <Note>Only workspace owners and admins can change automation.</Note>}
    <section className="card gr-card"><h3>Mode</h3>
      <div className="gr-modes">{MODES.map(([id, l, d]) => <button key={id} disabled={!canAdmin} className={`gr-mode ${a.mode === id ? "on" : ""}`} onClick={() => put({ mode: id })}><b>{l}</b><span>{d}</span></button>)}</div></section>
    <section className="card gr-card"><h3>Modules</h3>
      <div className="gr-mods gr-mods-1">{Object.entries(a.modules).map(([k, v]) => <label key={k} className="gr-mod"><input type="checkbox" disabled={!canAdmin} checked={v as boolean} onChange={(e) => put({ modules: { [k]: e.target.checked } })} />{MOD_LABEL[k] ?? k}</label>)}</div></section>
    <section className="card gr-card"><h3>Publishing permission</h3>
      <label className="gr-mod"><input type="checkbox" disabled={!canAdmin || !a.capabilities.youtube_upload} checked={a.publish_authorized}
        onChange={(e) => { if (!e.target.checked || confirm("Allow Autonomous mode to upload videos you have APPROVED to your YouTube channel as Private?")) put({ publish_authorized: e.target.checked }); }} />
        Upload my approved videos automatically (as Private) in Autonomous mode</label>
      <div className="dim">{a.capabilities.youtube_upload ? "Off = nothing reaches YouTube until you press Publish on a video." : "YouTube publishing isn't set up on this server yet."}</div></section>
    <section className="card gr-card"><h3>Scoring weights <span className="dim">(how next-video ideas are ranked)</span></h3>
      {Object.entries(a.weights).map(([k, v]) => <div key={k} className="gr-part"><span>{W_LABEL[k] ?? k}</span>
        <input type="range" min={0} max={50} value={v as number} disabled={!canAdmin} onChange={(e) => setA({ ...a, weights: { ...a.weights, [k]: +e.target.value } })}
          onPointerUp={() => put({ weights: a.weights })} onKeyUp={() => put({ weights: a.weights })} aria-label={W_LABEL[k]} /><b>{v as number}</b></div>)}
      <div className="dim">These are this app's own weights — not YouTube's ranking.</div></section>
    <section className="card gr-card"><div className="row"><h3 className="grow" style={{ margin: 0 }}>Capabilities & recent runs</h3><button className="btn sm" onClick={run}><Play size={13} />Run now</button></div>
      <div className="ch-chips" style={{ margin: "8px 0" }}>
        <span className={`badge ${a.capabilities.ai_writing ? "ok" : ""}`}>AI script writing: {a.capabilities.ai_writing ? "on" : "needs an AI key — templates used"}</span>
        <span className="badge ok">Voices: free on-server</span>
        <span className={`badge ${a.capabilities.youtube_upload ? "ok" : ""}`}>YouTube upload: {a.capabilities.youtube_upload ? "ready" : "not configured"}</span></div>
      {a.jobs.map((j: any) => <div key={j.id} className="gr-row"><span className="grow">{j.kind}</span><span className={`badge ${j.status === "succeeded" ? "ok" : ""}`}>{j.status}</span>
        <span className="dim">{new Date(j.created_at).toLocaleString()}</span></div>)}
      {!a.jobs.length && <div className="dim">No runs yet. The cycle also runs by itself every 2 hours.</div>}</section>
  </>;
}

/* --------------------------------------------------------------------------- publishing studio */
function ItemEditor({ it, patch, reload, close }: { it: Item; patch: (id: string, b: any) => Promise<void>; reload: () => void; close: () => void }) {
  const toast = useToast();
  const [bp, setBp] = useState<any>(it.blueprint || {}), [busy, setBusy] = useState(""), [privacy, setPrivacy] = useState("private"), [when, setWhen] = useState("");
  useEffect(() => setBp(it.blueprint || {}), [it]);
  async function act(name: string, f: () => Promise<any>, ok: string) { setBusy(name); try { await f(); toast(ok); reload(); } catch (e) { toast((e as Error).message); } finally { setBusy(""); } }
  const setScene = (i: number, k: string, v: string) => setBp({ ...bp, scenes: bp.scenes.map((s: any, j: number) => j === i ? { ...s, [k]: v } : s) });
  const hasBp = !!bp.scenes?.length;
  const ph = (v: any) => typeof v === "string" && v.startsWith("[") ? { value: "", placeholder: v.replace(/^\[|\]$/g, "") } : { value: v ?? "" };
  return <section className="card gr-card gr-editor">
    <div className="row" style={{ gap: 8 }}><h3 className="grow" style={{ margin: 0 }}>{it.title}</h3><span className={`badge s-${it.status}`}>{it.status}</span>
      <button className="btn sm ghost" onClick={close}>Close</button></div>
    {it.recommendation?.evidence?.length > 0 && <ul className="gr-ev">{it.recommendation.evidence.map((e: any) => <li key={e.text}><span className={`badge ${e.kind}`}>{e.kind}</span> {e.text}</li>)}</ul>}
    {!hasBp ? <button className="btn primary" disabled={!!busy} onClick={() => act("bp", () => api(`/growth/items/${it.id}/blueprint`, { method: "POST" }), "Blueprint ready")}><Wand2 size={14} />Create blueprint</button> : <>
      <div className="dim" style={{ fontSize: 12 }}>{bp.method}</div>
      <label className="gr-f">Hook (first line)<input className="input" {...ph(bp.hook ?? bp.hooks?.[0])} onChange={(e) => setBp({ ...bp, hook: e.target.value })} /></label>
      {bp.scenes.map((s: any, i: number) => <div key={i} className="gr-scene"><b>{i + 1}. </b><input className="input" value={s.heading} onChange={(e) => setScene(i, "heading", e.target.value)} aria-label="Scene heading" />
        <textarea className="input" rows={3} {...ph(s.narration)} onChange={(e) => setScene(i, "narration", e.target.value)} aria-label="Narration" />
        <input className="input" placeholder="What viewers see" {...ph(s.visual)} onChange={(e) => setScene(i, "visual", e.target.value)} aria-label="Visual" /></div>)}
      <label className="gr-f">Call to action<input className="input" {...ph(bp.cta)} onChange={(e) => setBp({ ...bp, cta: e.target.value })} /></label>
      <label className="gr-f">Thumbnail text<input className="input" value={bp.thumbnail_text ?? ""} maxLength={40} onChange={(e) => setBp({ ...bp, thumbnail_text: e.target.value })} /></label>
      <label className="gr-f">Description<textarea className="input" rows={3} value={bp.seo?.description ?? ""} onChange={(e) => setBp({ ...bp, seo: { ...bp.seo, description: e.target.value } })} /></label>
      <label className="gr-f">Tags (comma separated)<input className="input" value={(bp.seo?.tags || []).join(", ")} onChange={(e) => setBp({ ...bp, seo: { ...bp.seo, tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) } })} /></label>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <button className="btn" disabled={!!busy} onClick={() => act("save", () => patch(it.id, { blueprint: bp }), "Saved")}>Save</button>
        <button className="btn primary" disabled={!!busy || it.status === "production"} onClick={() => act("prod", async () => { await patch(it.id, { blueprint: bp }); await api(`/growth/items/${it.id}/produce`, { method: "POST", body: {} }); }, "Producing — voice, scene cards, captions and thumbnail")}>
          <Rocket size={14} />{it.project_id ? "Produce again" : "Produce video"}</button>
        {it.project_id && <Link className="btn" to={`/edit/${it.project_id}`}>Open in editor</Link>}
        {it.status === "review" && <button className="btn" onClick={() => act("ok", () => patch(it.id, { status: "approved" }), "Approved")}><Check size={14} />Approve</button>}
      </div>
      {it.unfinished.length > 0 && <div className="dim" role="status">Still to write: {it.unfinished.join(", ")}</div>}
      {it.blueprint?.produce_error && <div className="gr-warn" role="alert">Production failed: {it.blueprint.produce_error}</div>}
      {(it.blueprint?.produced?.warnings || []).map((w: string) => <div key={w} className="gr-warn">{w}</div>)}
    </>}
    {(it.status === "approved" || it.status === "scheduled") && <div className="gr-pub">
      <h3>Publish to YouTube</h3>
      {it.blueprint?.publish?.error && <div role="alert" className="dim">{it.blueprint.publish.error}</div>}
      {it.status === "scheduled" ? <div className="dim">Authorised. It uploads {it.blueprint?.publish?.when ? `after ${new Date(it.blueprint.publish.when).toLocaleString()}` : "as soon as the export finishes"} ({it.blueprint?.publish?.privacy}).</div> :
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <select className="input" value={privacy} onChange={(e) => setPrivacy(e.target.value)} aria-label="Privacy"><option value="private">Private</option><option value="unlisted">Unlisted</option><option value="public">Public</option></select>
          <input className="input" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} aria-label="Upload time (optional)" />
          <button className="btn primary" disabled={!!busy} onClick={() => act("pub", () => api(`/growth/items/${it.id}/publish`, { method: "POST", body: { privacy, when: when ? new Date(when).toISOString() : null } }), "Authorised — exporting, then uploading")}><Send size={14} />Publish</button>
        </div>}
      <div className="dim" style={{ fontSize: 12 }}>Marked as AI-altered content on YouTube. Nothing is uploaded without this click (or the Autonomous permission).</div></div>}
    {it.youtube_video_id && <a className="btn sm" href={`https://youtu.be/${it.youtube_video_id}`} target="_blank" rel="noreferrer noopener">Watch on YouTube ↗</a>}
    <button className="btn sm ghost" style={{ marginTop: 10 }} onClick={() => { if (confirm("Delete this plan? The project (if any) stays in your projects.")) act("del", () => api(`/growth/items/${it.id}`, { method: "DELETE" }), "Deleted").then(close); }}><Trash2 size={13} />Delete plan</button>
  </section>;
}

function Publishing({ ws, items, patch, reload }: { ws: string; items: Item[]; patch: (id: string, b: any) => Promise<void>; reload: () => void }) {
  const toast = useToast();
  const [sel, setSel] = useState<string | null>(null), [title, setTitle] = useState(""), [fmt, setFmt] = useState("long");
  const cur = items.find((i) => i.id === sel);
  useEffect(() => { if (items.some((i) => i.status === "production")) { const t = setTimeout(reload, 4000); return () => clearTimeout(t); } }, [items, reload]);
  async function add(e: React.FormEvent) { e.preventDefault(); try { await api("/growth/items", { method: "POST", body: { workspace_id: ws, title, format: fmt } }); setTitle(""); reload(); } catch (x) { toast((x as Error).message); } }
  return <>
    <form className="gr-add" onSubmit={add}><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New video idea title" maxLength={200} aria-label="New video title" />
      <select className="input" value={fmt} onChange={(e) => setFmt(e.target.value)} aria-label="Format" style={{ maxWidth: 130 }}><option value="long">Long video</option><option value="short">Short</option></select>
      <button className="btn primary" disabled={!title.trim()}><Plus size={14} />Add</button></form>
    {cur && <ItemEditor it={cur} patch={patch} reload={reload} close={() => setSel(null)} />}
    <div className="gr-board">{STATUSES.map((s) => <div key={s} className="gr-col"><div className="gr-col-h">{s} <span className="dim">{items.filter((i) => i.status === s).length}</span></div>
      {items.filter((i) => i.status === s).map((i) => <button key={i.id} className={`gr-card-i ${sel === i.id ? "on" : ""}`} onClick={() => setSel(i.id)}>
        <b>{i.title}</b><span className="dim">{i.format === "short" ? "Short" : "Long"}{i.scheduled_at ? ` · ${new Date(i.scheduled_at).toLocaleDateString()}` : ""}{s === "production" ? " · working…" : ""}</span></button>)}</div>)}</div>
  </>;
}

/* --------------------------------------------------------------------------- performance */
function Performance({ perf }: { perf: any }) {
  if (!perf) return <div className="spinner" />;
  return <>
    {!perf.videos.length ? <div className="card empty">Videos published from the Publishing studio appear here with their estimate and measured views at 1, 3, 7 and 30 days.</div> :
      <section className="card gr-card"><table className="gr-table"><thead><tr><th>Video</th><th>Estimate</th><th>Day 1</th><th>Day 3</th><th>Day 7</th><th>Day 30</th><th>vs estimate</th></tr></thead>
        <tbody>{perf.videos.map((r: any) => <tr key={r.item.id}><td><a href={`https://youtu.be/${r.item.youtube_video_id}`} target="_blank" rel="noreferrer noopener">{r.item.title}</a></td>
          <td>{r.predicted.typical ? `${num(r.predicted.low)}–${num(r.predicted.high)}` : "—"}</td>
          {["d1", "d3", "d7", "d30"].map((k) => <td key={k}>{num(r.measured[k])}</td>)}<td>{r.vs_estimate ? `${r.vs_estimate}×` : "—"}</td></tr>)}</tbody></table></section>}
    <Note>{perf.note}</Note>
  </>;
}

/* --------------------------------------------------------------------------- strategy library */
const LIB: [string, string[]][] = [
  ["Packaging (title + thumbnail)", ["Decide the title and thumbnail before you film — they are the promise the video must keep.", "One idea per thumbnail: a face or object, 3–4 words maximum, high contrast.", "Titles that state a specific outcome or question usually beat vague ones. Test against your own data in Content intelligence."]],
  ["Hooks and retention", ["Show the payoff or the question in the first 5 seconds; skip long intros and channel greetings.", "Change something on screen every few seconds in Shorts (cut, zoom, caption).", "Use chapters on long videos so viewers can jump instead of leaving."]],
  ["Consistency", ["A schedule you can keep beats a fast one you can't. Batch scripts on one day, record on another.", "Series (same format, numbered) help returning viewers know what to expect."]],
  ["Shorts and long videos", ["Shorts are good for reach and testing topics; long videos build watch time and loyal viewers.", "Turn your best long video moments into Shorts that point back to the full video."]],
  ["Learning from competitors", ["Study which topics and formats work in your niche, then add your own angle, experience or data.", "Never copy titles, scripts, thumbnails or footage. Original work is both safer and better for the channel."]],
  ["Honest expectations", ["No tool can guarantee views. Estimates here are ranges from your own history.", "Judge a video after 7 days, compare with your usual, and change one thing at a time."]],
];
function StrategyLibrary() {
  return <div className="gr-grid">{LIB.map(([h, xs]) => <section key={h} className="card gr-card"><h3>{h}</h3><ul className="ch-tips">{xs.map((x) => <li key={x}>{x}</li>)}</ul></section>)}</div>;
}

/* --------------------------------------------------------------------------- page */
export default function Growth() {
  const ws = useWs();
  const { workspace } = useAuth();
  const toast = useToast();
  const [sp, setSp] = useSearchParams();
  const tab = sp.get("tab") || "overview";
  const [ov, setOv] = useState<any>(null), [items, setItems] = useState<Item[]>([]), [perf, setPerf] = useState<any>(null), [err, setErr] = useState("");
  const load = useCallback(async () => {
    if (!ws) return;
    try {
      const [o, i, p] = await Promise.all([api(`/growth/overview?workspace_id=${ws}`), api<Item[]>(`/growth/items?workspace_id=${ws}`), api(`/growth/performance?workspace_id=${ws}`)]);
      setOv(o); setItems(i); setPerf(p); setErr("");
    } catch (e) { setErr((e as Error).message); }
  }, [ws]);
  useEffect(() => { load(); }, [load]);
  const patch = useCallback(async (id: string, b: any) => {
    try { const r = await api<Item>(`/growth/items/${id}`, { method: "PATCH", body: b }); setItems((xs) => xs.map((x) => x.id === id ? r : x)); }
    catch (e) { toast((e as Error).message); throw e; }
  }, [toast]);
  const go = (t: string) => setSp({ tab: t });
  const role = (workspace as any)?.role;
  const canAdmin = !role || role === "owner" || role === "admin";
  return (
    <UniverseShell u={null}>
      <div className="page-h"><div><h1 className="row" style={{ gap: 10 }}><Rocket size={24} color="#7b61ff" />Growth</h1>
        <div className="muted">Plan, make and measure your next videos from real channel data.</div></div>
        <button className="btn" onClick={load}><RefreshCw size={14} />Refresh</button></div>
      <nav className="gr-tabs" aria-label="Growth sections">{TABS.map((t) => <button key={t.id} className={`gr-tab ${tab === t.id ? "on" : ""}`} onClick={() => go(t.id)} aria-current={tab === t.id ? "page" : undefined}><t.icon size={14} />{t.label}</button>)}</nav>
      {err && <div className="card empty" role="alert">{err}</div>}
      {!ov && !err ? <div className="spinner" /> : ov && <div className="gr">
        {tab === "overview" && <Overview ws={ws} ov={ov} reload={load} go={go} />}
        {tab === "next" && <NextVideo ws={ws} onPlanned={load} />}
        {tab === "coach" && <Coach ws={ws} />}
        {tab === "intel" && <Intel ov={ov} perf={perf} />}
        {tab === "competitors" && <Competitors ws={ws} />}
        {tab === "calendar" && <Calendar items={items} patch={(id, b) => { patch(id, b).catch(() => {}); }} />}
        {tab === "automation" && <Automation ws={ws} canAdmin={canAdmin} />}
        {tab === "publish" && <Publishing ws={ws} items={items} patch={patch} reload={load} />}
        {tab === "performance" && <Performance perf={perf} />}
        {tab === "library" && <StrategyLibrary />}
      </div>}
    </UniverseShell>
  );
}
