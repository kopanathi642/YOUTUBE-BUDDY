import { useCallback, useEffect, useState } from "react";
import { Bot, RefreshCw, HeartPulse, Lightbulb, Check, X, ExternalLink } from "lucide-react";
import { api } from "../api";
import { useToast } from "../App";

type Problem = { problem: string; who?: string; mentions?: number; severity?: string; evidence?: { title: string; url: string }[]; our_tools?: string[]; gap?: boolean;
  idea?: { name: string; what: string; how_free?: string; effort?: string } | string | null; decision?: string };
type Report = { id: string; kind: string; status: string; summary: string; created_at: string; data: any };
type Agent = { research: Report | null; health: Report | null; ai_mode: boolean; history: Omit<Report, "data">[] };
const safe = (u?: string) => (u && /^https:\/\//.test(u) ? u : undefined);   // links come from the internet: https only

/** Founder-only: the background Creator Scout agent — health checks + creator problems + tool ideas. */
export default function AgentCard() {
  const toast = useToast();
  const [a, setA] = useState<Agent | null>(null), [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(() => api<Agent>("/admin/agent").then(setA).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);
  async function run(kind: "health" | "research") {
    setBusy(kind);
    try {
      const r = await api<{ done: boolean }>("/admin/agent/run", { method: "POST", body: { kind } });
      if (!r.done) { toast("Research started — reading creator communities, this takes a minute"); setTimeout(() => { load(); setBusy(null); }, 45000); return; }
      await load();
    } catch (e) { toast((e as Error).message); }
    setBusy(null);
  }
  async function decide(i: number, decision: string) {
    try { await api(`/admin/agent/reports/${a!.research!.id}/decide`, { method: "POST", body: { index: i, decision } }); load(); } catch (e) { toast((e as Error).message); }
  }
  if (!a) return null;
  const h = a.health, r = a.research, probs: Problem[] = r?.data?.problems ?? [];
  return (
    <section className="card" style={{ padding: 18, gridColumn: "1 / -1" }} id="agent">
      <div className="row" style={{ marginBottom: 6 }}><Bot size={16} color="#a78bfa" /><b className="grow">Creator Scout agent</b>
        <span className="badge">{a.ai_mode ? "AI mode" : "free mode"}</span></div>
      <div className="dim" style={{ fontSize: 12, marginBottom: 10 }}>Runs in the background: checks the app every hour and reads creator communities and YouTube news every day, then suggests what to build. It never changes anything by itself.{!a.ai_mode && " Add ANTHROPIC_API_KEY on the server for deeper AI analysis."}</div>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <button className="btn sm" disabled={!!busy} onClick={() => run("health")}><HeartPulse size={13} />{busy === "health" ? "Checking…" : "Check health now"}</button>
        <button className="btn sm" disabled={!!busy} onClick={() => run("research")}><RefreshCw size={13} className={busy === "research" ? "spin" : ""} />{busy === "research" ? "Researching…" : "Research now"}</button>
      </div>
      {h && <div className={`agent-health ${h.status}`}><HeartPulse size={14} /><span className="grow">{h.summary}</span><span className="dim">{new Date(h.created_at).toLocaleString()}</span></div>}
      {r && <>
        <div className="label" style={{ marginTop: 12 }}>Latest research · {new Date(r.created_at).toLocaleString()} · {r.data?.mode}</div>
        <div style={{ fontSize: 13, marginBottom: 8 }}>{r.summary}</div>
        {probs.map((p, i) => { const idea = typeof p.idea === "string" ? { name: p.idea, what: "" } : p.idea; return (
          <div key={i} className={`agent-prob ${p.decision ?? ""}`}>
            <div className="row"><b className="grow">{p.problem}</b>{p.severity && <span className={`badge ${p.severity === "high" ? "err" : ""}`}>{p.severity}</span>}
              {p.mentions ? <span className="badge">{p.mentions} mentions</span> : null}</div>
            {p.who && <div className="dim" style={{ fontSize: 11.5 }}>{p.who}</div>}
            {!!p.our_tools?.length && <div style={{ fontSize: 12 }}>We already have: {p.our_tools.join(", ")}</div>}
            {idea && <div className="agent-idea"><Lightbulb size={13} color="#fbbf24" /><span><b>{idea.name}</b>{idea.what ? ` — ${idea.what}` : ""}{"how_free" in idea && idea.how_free ? <span className="dim"> · Free way: {idea.how_free}</span> : null}{"effort" in idea && idea.effort ? <span className="dim"> · effort {idea.effort}</span> : null}</span></div>}
            {!!p.evidence?.length && <div className="agent-ev">{p.evidence.slice(0, 3).map((e, j) => safe(e.url) ? <a key={j} href={safe(e.url)} target="_blank" rel="noreferrer noopener nofollow"><ExternalLink size={10} />{e.title.slice(0, 70)}</a> : null)}</div>}
            {idea && <div className="row" style={{ gap: 6, marginTop: 4 }}>
              {p.decision ? <span className="badge">{p.decision}</span> : <>
                <button className="btn sm" onClick={() => decide(i, "accepted")}><Check size={12} />Add to roadmap</button>
                <button className="btn sm ghost" onClick={() => decide(i, "dismissed")}><X size={12} />Dismiss</button></>}
            </div>}
          </div>); })}
        {!!r.data?.updates?.length && <><div className="label" style={{ marginTop: 10 }}>Platform updates</div>
          {r.data.updates.slice(0, 6).map((u: any, i: number) => <div key={i} style={{ fontSize: 12, margin: "4px 0" }}>{safe(u.url) ? <a href={safe(u.url)} target="_blank" rel="noreferrer noopener nofollow" style={{ color: "#c4b5fd" }}>{u.title}</a> : u.title}{u.impact ? <span className="dim"> — {u.impact}</span> : null}</div>)}</>}
      </>}
      {!r && <div className="dim" style={{ fontSize: 12, marginTop: 10 }}>No research yet — it runs automatically within a day, or press Research now.</div>}
    </section>
  );
}
