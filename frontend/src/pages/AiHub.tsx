import { CSSProperties, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Search, KeyRound, CheckCircle2, Lock, ArrowRight, Sparkles, Grid3x3, Rows3 } from "lucide-react";
import { api } from "../api";
import { useAuth } from "../App";
import { ENGINE_LABEL, Generation, Tool, useCatalogue } from "../ai/core";
import { STUDIO_META } from "../ai/studios";
import { Thumb } from "../ai/controls";
import { Frame } from "./AiTool";
import "../ai/ai.css";

function StateDot({ t }: { t: Tool }) {
  return t.status.state === "ready" ? <span className="st ready" title={t.status.detail}><CheckCircle2 size={12} />Ready</span>
    : t.status.state === "needs_key" ? <span className="st key" title={`Needs ${t.status.needs.join(", ")}`}><KeyRound size={12} />Needs key</span>
    : <span className="st unbuilt" title={t.status.detail}><Lock size={12} />Not built</span>;
}

function ToolCard({ t }: { t: Tool }) {
  const m = STUDIO_META[t.studio];
  return (
    <Link to={`/ai-generator/tool/${t.id}`} className={`tcard ${t.status.state}`} style={{ "--s1": m.c1, "--s2": m.c2 } as CSSProperties}>
      <span className="tc-id">{t.id}</span><b>{t.name}</b><p>{t.summary}</p>
      <span className="tc-foot"><StateDot t={t} /><span className="dim">{ENGINE_LABEL[t.engine]}</span></span>
    </Link>
  );
}

/** /ai-generator — studio hub + global tool search */
export function AiHub() {
  const { cat } = useCatalogue();
  const { workspace, me } = useAuth();
  const [q, setQ] = useState("");
  const [recent, setRecent] = useState<Generation[]>([]);
  useEffect(() => { if (workspace) api<Generation[]>(`/workspaces/${workspace.id}/generations?limit=12`).then(setRecent).catch(() => {}); }, [workspace]);
  const hits = useMemo(() => (q.trim() && cat ? cat.tools.filter((t) => `${t.id} ${t.name} ${t.summary} ${t.slug}`.toLowerCase().includes(q.toLowerCase())).slice(0, 12) : []), [q, cat]);
  return (
    <Frame>
      <div className="hub">
        <div className="hub-head">
          <div><h1><Sparkles size={22} /> Your AI creative studio</h1>
            <p className="muted">{cat ? `${cat.studios.length} studios · ${cat.tools.length} tools ready to use` : "Loading tools…"}</p></div>
          {cat && <div className="hub-counts"><span className="st ready"><CheckCircle2 size={12} />{cat.tools.length} ready</span>
            <Link className="btn sm" to="/ai-generator/explore"><Rows3 size={13} />Tool explorer</Link></div>}
        </div>
        <div className="hub-search"><Search size={16} /><input placeholder="Search tools — e.g. thumbnail, dub, captions, slow motion" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search tools" /></div>
        {hits.length > 0 && <div className="tgrid">{hits.map((t) => <ToolCard key={t.id} t={t} />)}</div>}
        {cat && q.trim() && hits.length === 0 && <div className="card empty" role="status"><Search size={24} /><b>No tools match “{q}”</b><button className="btn" onClick={() => setQ("")}>Clear search</button></div>}
        {me?.is_platform_admin && cat && !cat.keys.fal && <div className="keys-banner"><KeyRound size={16} /><div><b>Connect services to enable more tools.</b>
          <span> Video, image, music, lip-sync and 3D generation run on fal.ai (Veo 3.1, Kling 3, Seedance, MiniMax, FLUX, ElevenLabs). Add <code>FAL_KEY</code> in the host's secret settings to turn on {cat.tools.filter((t) => t.status.needs.some((n) => n.startsWith("FAL"))).length} tools.
            {!cat.keys.llm && <> Writing and strategy tools need <code>GROQ_API_KEY</code>, <code>ANTHROPIC_API_KEY</code> or <code>OPENAI_API_KEY</code>.</>}{!cat.keys.youtube && <> Channel research needs <code>YOUTUBE_API_KEY</code>.</>}</span></div></div>}
        {!q.trim() && <div className="studios">
          {cat?.studios.map((s) => { const m = STUDIO_META[s.id]; const I = m.icon; const ts = cat.tools.filter((t) => t.studio === s.id); const r = ts.filter((t) => t.status.state === "ready").length; return (
            <Link key={s.id} to={`/ai-generator/studio/${s.id}`} className={`studio-card motif-${m.motif}`} style={{ "--s1": m.c1, "--s2": m.c2 } as CSSProperties}>
              <span className="sc-art" aria-hidden="true"><i /><i /><i /></span>
              <I size={22} className="sc-icon" />
              <b>{s.name}</b><p>{s.tagline}</p>
              <span className="sc-foot">{r} tools available<ArrowRight size={14} /></span>
            </Link>); })}
        </div>}
        {recent.length > 0 && <><h3 className="hub-h">Recent generations</h3><div className="recent">{recent.map((g) => (
          <Link key={g.id} to={`/ai-generator/tool/${g.tool_id}`} className="recent-item"><Thumb a={g.outputs[0]} size={120} /><b className="ellipsis">{g.tool_name}</b><span className="dim small">v{g.version} · {g.status}</span></Link>))}</div></>}
      </div>
    </Frame>
  );
}

/** /ai-generator/studio/:sid — a studio's front door: its 10 tools as a launch deck */
export function AiStudio() {
  const { sid = "video" } = useParams();
  const { cat } = useCatalogue();
  const s = cat?.studios.find((x) => x.id === sid);
  const m = STUDIO_META[sid] ?? STUDIO_META.video;
  const I = m.icon;
  const ts = cat?.tools.filter((t) => t.studio === sid) ?? [];
  return (
    <Frame studio={sid}>
      <div className={`studio-front motif-${m.motif}`} style={{ "--s1": m.c1, "--s2": m.c2 } as CSSProperties}>
        <div className="sf-hero"><span className="sc-art big" aria-hidden="true"><i /><i /><i /></span><I size={30} />
          <div><span className="sf-code">Studio {s?.code}</span><h1>{s?.name}</h1><p>{s?.tagline}</p></div></div>
        <div className="sf-deck">{ts.map((t, i) => (
          <Link key={t.id} to={`/ai-generator/tool/${t.id}`} className={`sf-tool ${t.status.state}`} style={{ "--i": i } as CSSProperties}>
            <span className="tc-id">{t.id}</span><b>{t.name}</b><p>{t.summary}</p>
            <span className="tc-foot"><StateDot t={t} />{t.models.length > 0 && <span className="dim small">{t.models.slice(0, 3).map((x) => x.label.split(" (")[0]).join(" · ")}</span>}</span>
            {t.status.state !== "ready" && <small className="sf-need">{t.status.state === "needs_key" ? `Needs ${t.status.needs.join(" + ")}` : t.status.detail}</small>}
          </Link>))}</div>
      </div>
    </Frame>
  );
}

/** /ai-generator/explore — every tool, filterable by studio, status and engine */
export function AiExplorer() {
  const { cat } = useCatalogue();
  const [params, setParams] = useSearchParams();
  const studio = params.get("studio") ?? "", state = params.get("state") ?? "", engine = params.get("engine") ?? "";
  const [q, setQ] = useState("");
  const [grid, setGrid] = useState(false);
  const list = (cat?.tools ?? []).filter((t) => (!studio || t.studio === studio) && (!state || t.status.state === state) && (!engine || t.engine === engine)
    && (!q || `${t.id} ${t.name} ${t.summary}`.toLowerCase().includes(q.toLowerCase())));
  const setF = (k: string, v: string) => { const p = new URLSearchParams(params); v ? p.set(k, v) : p.delete(k); setParams(p, { replace: true }); };
  return (
    <Frame>
      <div className="explorer">
        <div className="hub-head"><div><h1>Tool explorer</h1><p className="muted">{list.length} of 120 tools</p></div>
          <button type="button" className="btn sm" onClick={() => setGrid(!grid)}>{grid ? <Rows3 size={13} /> : <Grid3x3 size={13} />}{grid ? "Table" : "Cards"}</button></div>
        <div className="ex-filters">
          <div className="hub-search sm"><Search size={14} /><input placeholder="Filter" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter tools" /></div>
          <select className="input sm" value={studio} onChange={(e) => setF("studio", e.target.value)} aria-label="Studio"><option value="">All studios</option>{cat?.studios.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}</select>
          <select className="input sm" value={state} onChange={(e) => setF("state", e.target.value)} aria-label="Status"><option value="">Any status</option><option value="ready">Ready</option><option value="needs_key">Needs key</option><option value="unbuilt">Not built</option></select>
          <select className="input sm" value={engine} onChange={(e) => setF("engine", e.target.value)} aria-label="Engine"><option value="">Any engine</option>{Object.entries(ENGINE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </div>
        {grid ? <div className="tgrid">{list.map((t) => <ToolCard key={t.id} t={t} />)}</div> : (
          <table className="ex-table"><thead><tr><th>ID</th><th>Tool</th><th>Studio</th><th>Engine</th><th>Models</th><th>Output</th><th>Status</th></tr></thead>
            <tbody>{list.map((t) => <tr key={t.id}><td className="mono">{t.id}</td><td><Link to={`/ai-generator/tool/${t.id}`}><b>{t.name}</b></Link><small className="dim">{t.summary}</small></td>
              <td>{cat?.studios.find((s) => s.id === t.studio)?.code}</td><td className="small">{ENGINE_LABEL[t.engine]}</td>
              <td className="small dim">{t.models.map((m) => m.label.split(" (")[0]).slice(0, 3).join(", ") || "—"}</td><td className="small">{t.output}{t.timeline ? " · timeline" : ""}</td>
              <td><StateDot t={t} />{t.status.state === "needs_key" && <small className="dim">{t.status.needs.join(", ")}</small>}</td></tr>)}</tbody></table>)}
      </div>
    </Frame>
  );
}
