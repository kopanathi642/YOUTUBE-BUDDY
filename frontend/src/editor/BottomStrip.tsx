import { useState } from "react";
import { Plus, Film } from "lucide-react";
import { Asset, fmtBytes } from "../api";
import { Timeline, end, framesToTimecode } from "../timeline";
import { buildPlan } from "../smart";

export default function BottomStrip({ tl, assets, setPlayhead, setSelected, setNotes, readOnly, onAddScene }: {
  tl: Timeline; assets: Map<string, Asset>; setPlayhead: (f: number) => void; setSelected: (id: string) => void;
  setNotes: (s: string) => void; readOnly: boolean; onAddScene: () => void;
}) {
  const [tab, setTab] = useState<"story" | "scenes" | "chapters" | "assets" | "notes" | "ai">("story");
  const fps = tl.fps;
  const vclips = tl.tracks.filter((t) => t.kind === "video").flatMap((t) => t.clips.map((c) => ({ c, t }))).sort((a, b) => a.c.start - b.c.start);
  const base = tl.tracks.filter((t) => t.kind === "video").slice(-1)[0];
  const story = (base?.clips ?? []).slice().sort((a, b) => a.start - b.start);
  const scenes = vclips.flatMap(({ c }) => ((assets.get(c.asset_id) as any)?.analysis?.scenes ?? [])
    .map((s: any) => ({ f: c.start + Math.round(s.start * fps - c.in), e: c.start + Math.round(s.end * fps - c.in), clip: c, score: s.score }))
    .filter((s: any) => s.e > c.start && s.f < end(c)).map((s: any) => ({ ...s, f: Math.max(s.f, c.start), e: Math.min(s.e, end(c)) })));
  const used = [...new Set(tl.tracks.flatMap((t) => t.clips.map((c) => c.asset_id)))].map((id) => assets.get(id)).filter(Boolean) as Asset[];
  const tabs: [typeof tab, string][] = [["story", "Storyboard"], ["scenes", "Scenes"], ["chapters", "Chapters"], ["assets", "Assets"], ["notes", "Notes"], ["ai", "AI Suggestions"]];
  const thumb = (id: string) => assets.get(id)?.thumbnail_url ?? (assets.get(id)?.kind === "image" ? assets.get(id)?.proxy_url : null);
  return (
    <section className="panel bottom-panel storyboard" aria-label="Storyboard">
      <div className="mini-tabs" role="tablist">{tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>)}</div>
      <div className="sb-body">
        {tab === "story" && <>{story.map((c, i) => (
          <button key={c.id} className="sb-card" onClick={() => { setSelected(c.id); setPlayhead(c.start); }}>
            {thumb(c.asset_id) ? <img src={thumb(c.asset_id)!} alt="" /> : <span className="sb-ph"><Film size={14} /></span>}
            <span className="sb-cap"><b>{String(i + 1).padStart(2, "0")} {(assets.get(c.asset_id)?.filename ?? "Missing").replace(/\.[^.]+$/, "").slice(0, 12)}</b><br />{framesToTimecode(c.start, fps).slice(3, 8)} – {framesToTimecode(end(c), fps).slice(3, 8)}</span>
          </button>))}
          <button className="sb-card add" onClick={onAddScene} disabled={readOnly} title="Split the main track at the playhead"><Plus size={16} /><span>Add Scene</span></button>
        </>}
        {tab === "scenes" && (scenes.length ? scenes.map((s: any, i: number) => (
          <button key={i} className="sb-card" onClick={() => { setPlayhead(s.f); setSelected(s.clip.id); }}>
            {thumb(s.clip.asset_id) ? <img src={thumb(s.clip.asset_id)!} alt="" /> : <span className="sb-ph" />}
            <span className="sb-cap"><b>Scene {i + 1}</b><br />{framesToTimecode(s.f, fps).slice(3, 8)} · cut {Math.round(s.score * 100)}%</span>
          </button>)) : <span className="dim sb-empty">Scene cuts appear here for clips on the timeline (detected by the cloud worker).</span>)}
        {tab === "chapters" && (story.length ? <ol className="chapters">{story.map((c, i) => <li key={c.id}><button onClick={() => setPlayhead(c.start)}>{framesToTimecode(c.start, fps).slice(3, 8)}</button> {(assets.get(c.asset_id)?.filename ?? "").replace(/\.[^.]+$/, "") || `Chapter ${i + 1}`}</li>)}</ol>
          : <span className="dim sb-empty">Chapters follow the clips on your main track.</span>)}
        {tab === "assets" && (used.length ? used.map((a) => <span key={a.id} className="asset-chip">{a.filename} · {fmtBytes(a.size_bytes)}</span>) : <span className="dim sb-empty">No media on the timeline yet.</span>)}
        {tab === "notes" && <textarea className="notes" placeholder="Notes for this sequence (saved with it)…" defaultValue={tl.notes ?? ""} disabled={readOnly}
          onBlur={(e) => e.target.value !== (tl.notes ?? "") && setNotes(e.target.value)} maxLength={10000} aria-label="Sequence notes" />}
        {tab === "ai" && (() => { const ops = buildPlan(tl, assets); return ops.length ? ops.map((o) => <span key={o.id} className="asset-chip" title={o.detail}>💡 {o.label}</span>) : <span className="dim sb-empty">No suggestions yet.</span>; })()}
      </div>
    </section>
  );
}
