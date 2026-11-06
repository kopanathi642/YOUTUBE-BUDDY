import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Clapperboard, Image as ImageIcon, Wand2, PersonStanding, AudioLines, PenLine, ScanSearch, TrendingUp, Brush, BrainCircuit, Languages, Workflow,
  Camera, Sun, Layers, Film, Play, ListOrdered, SplitSquareHorizontal, Gauge, Box, Mic2, Music2, ExternalLink } from "lucide-react";
import { Asset } from "../api";
import { Advanced, Consent, Control, Controls, Ctx, Thumb } from "./controls";
import { Generation, mmss, Tool } from "./core";
import { AiBadge, Compare, MediaView, Result, Timebar, TranscriptView, useWave, Wave } from "./outputs";
import NodeCanvas, { Graph } from "./nodes";

export const STUDIO_META: Record<string, { icon: any; c1: string; c2: string; motif: string }> = {
  video: { icon: Clapperboard, c1: "#7c3aed", c2: "#2563eb", motif: "cinema" },
  image: { icon: ImageIcon, c1: "#c026d3", c2: "#7c3aed", motif: "artboard" },
  transform: { icon: Wand2, c1: "#2563eb", c2: "#06b6d4", motif: "split" },
  animation: { icon: PersonStanding, c1: "#db2777", c2: "#f59e0b", motif: "stage" },
  audio: { icon: AudioLines, c1: "#0891b2", c2: "#7c3aed", motif: "wave" },
  writing: { icon: PenLine, c1: "#a78bfa", c2: "#f472b6", motif: "paper" },
  content: { icon: ScanSearch, c1: "#0ea5e9", c2: "#22c55e", motif: "scan" },
  creator: { icon: TrendingUp, c1: "#f59e0b", c2: "#ef4444", motif: "chart" },
  imageedit: { icon: Brush, c1: "#8b5cf6", c2: "#ec4899", motif: "canvas" },
  videointel: { icon: BrainCircuit, c1: "#6366f1", c2: "#14b8a6", motif: "shots" },
  localize: { icon: Languages, c1: "#10b981", c2: "#3b82f6", motif: "globe" },
  automation: { icon: Workflow, c1: "#9333ea", c2: "#22d3ee", motif: "nodes" },
};

export type LayoutProps = {
  t: Tool; c: Ctx; g: Generation | null; history: Generation[]; select: (id: string) => void; runBar: ReactNode; actions: ReactNode;
  input?: Asset; onUse: (k: string, v: any) => void; tools: Tool[]; studios: any[];
};

export function Panel({ title, icon: I, children, className, right }: { title: string; icon?: any; children: ReactNode; className?: string; right?: ReactNode }) {
  return <section className={`pnl ${className ?? ""}`}><header>{I && <I size={14} />}<span>{title}</span>{right}</header><div className="pnl-b">{children}</div></section>;
}

const GEN_LABEL: Record<string, string> = { queued: "Queued", running: "Generating", succeeded: "Done", failed: "Failed", canceled: "Cancelled", awaiting_approval: "Awaiting approval" };

export function RenderQueue({ history, g, select, horizontal = true }: { history: Generation[]; g: Generation | null; select: (id: string) => void; horizontal?: boolean }) {
  if (!history.length) return <div className="dim small queue-empty">Your runs appear here — every version is kept.</div>;
  return (
    <div className={`queue ${horizontal ? "h" : "v"}`}>
      {history.map((h) => { const o = h.outputs[0]; const busy = ["queued", "running"].includes(h.status); return (
        <button type="button" key={h.id} className={`q-item ${h.id === g?.id ? "on" : ""} ${h.status}`} onClick={() => select(h.id)}>
          <span className="q-thumb">{o ? <Thumb a={o} size={horizontal ? 104 : 72} /> : <span className="q-icon">{h.tool_id}</span>}
            {busy && <span className="q-prog"><i style={{ width: `${Math.round((h.job?.progress ?? 0) * 100)}%` }} /></span>}</span>
          <span className="q-meta"><b>v{h.version}</b><span className={`q-st ${h.status}`}>{GEN_LABEL[h.status] ?? h.status}</span></span>
        </button>); })}
    </div>
  );
}

function Progress({ g }: { g: Generation | null }) {
  if (!g || !["queued", "running"].includes(g.status)) return null;
  const p = Math.round((g.job?.progress ?? 0) * 100);
  return <div className="gen-progress" role="status"><div className="gp-bar"><i style={{ width: `${Math.max(3, p)}%` }} /></div><span>{g.job?.stage ?? (g.status === "queued" ? "waiting for a worker" : "working")} · {p}%</span></div>;
}

/** Shows what a run produced: media, sequences (open in editor) or a structured result. */
export function Output({ g, seek, onUse, empty, single }: { g: Generation | null; seek?: (t: number) => void; onUse: (k: string, v: any) => void; empty?: ReactNode; single?: boolean }) {
  const [i, setI] = useState(0);
  useEffect(() => setI(0), [g?.id]);
  if (!g) return <div className="out-empty">{empty}</div>;
  const seqs: string[] = g.result?.sequence_ids ?? [];
  return (
    <div className="out">
      <Progress g={g} />
      {g.status === "failed" && <div className="error-box" role="alert">{g.error}</div>}
      {g.status === "awaiting_approval" && <div className="info-box">This workflow is paused at an approval gate — review the results so far, then approve it below.</div>}
      {g.outputs.length > 0 && (single || g.outputs.length === 1 ? <div className="out-media"><MediaView a={g.outputs[i]} className="stage-media" /><AiBadge a={g.outputs[i]} /></div>
        : <div className="out-grid">{g.outputs.map((o, j) => <button type="button" key={o.id} className={`og-cell ${j === i ? "on" : ""}`} onClick={() => setI(j)}><MediaView a={o} controls={o.kind !== "video"} /><AiBadge a={o} /></button>)}</div>)}
      {seqs.length > 0 && <div className="seq-list">{seqs.map((s, j) => <Link key={s} className="seq-card" to={`/edit/${g.project_id}?seq=${s}`}><Film size={16} /><span>Sequence {j + 1}</span><ExternalLink size={13} /></Link>)}</div>}
      {g.status === "succeeded" && <Result g={g} seek={seek} onUse={onUse} />}
    </div>
  );
}

/* ================================================================== A. Video generation — the director's monitor */

function Monitor({ aspect = "16:9", children, move }: { aspect?: string; children: ReactNode; move?: string }) {
  const [w, h] = aspect.split(":").map(Number);
  return (
    <div className="monitor">
      <div className="mon-frame" style={{ aspectRatio: `${w} / ${h}` }}>
        {children}
        <div className="mon-guides" aria-hidden="true"><i /><i /><i /><i /></div>
        {move && <div className={`mon-move cam-${move.replace(/\s/g, "-")}`} aria-hidden="true"><span>{move}</span></div>}
        <span className="mon-tc">REC · {aspect}</span>
      </div>
    </div>
  );
}

export function VideoStudio(L: LayoutProps) {
  const { t, c, g } = L;
  if (t.ui === "shotbuilder") return (
    <div className="L video-shots">
      <Panel title="Storyboard — compose the film shot by shot" icon={ListOrdered} className="a-board"><Control p={t.params.find((p) => p.key === "shots")!} c={c} /></Panel>
      <Panel title="Screening room" icon={Play} className="a-mon"><Monitor aspect={c.v.aspect_ratio}><Output g={g} onUse={L.onUse} single empty={<span>Your stitched film plays here</span>} /></Monitor></Panel>
      <Panel title="Film settings" icon={Gauge} className="a-rig"><Controls c={c} keys={["aspect_ratio", "resolution", "generate_audio"]} /><Advanced c={c} />{L.runBar}</Panel>
      <Panel title="Render queue" icon={Film} className="a-queue">{L.actions}<RenderQueue history={L.history} g={g} select={L.select} /></Panel>
    </div>);
  const refs = t.params.filter((p) => ["media", "media_multi"].includes(p.type) || ["product_name", "tagline", "ad_style", "brand_color"].includes(p.key)).map((p) => p.key);
  const rig = ["camera_move", "camera_angle", "lens", "depth_of_field", "lighting", "motion"].filter((k) => t.params.some((p) => p.key === k));
  const fmt = ["aspect_ratio", "duration", "resolution", "generate_audio", "variations"].filter((k) => t.params.some((p) => p.key === k));
  const inputImg = c.media.find((m) => m.id === c.v.image);
  return (
    <div className="L video">
      <Panel title="Scene" icon={PenLine} className="a-script">
        <Controls c={c} keys={["prompt", "subject_motion"].filter((k) => t.params.some((p) => p.key === k))} flavor="video" />
        {refs.length > 0 && <div className="ref-zone"><Controls c={c} keys={refs} /></div>}
        <Consent c={c} />
      </Panel>
      <Panel title="Director's monitor" icon={Camera} className="a-mon">
        <Monitor aspect={c.v.aspect_ratio || "16:9"} move={!g?.outputs.length ? c.v.camera_move : undefined}>
          {g ? <Output g={g} onUse={L.onUse} single /> : inputImg ? <MediaView a={inputImg} className="stage-media" /> : <div className="mon-empty"><Clapperboard size={34} /><span>Direct your shot on the left and right, then roll camera.</span></div>}
        </Monitor>
      </Panel>
      <Panel title="Camera rig" icon={Camera} className="a-rig">
        <Controls c={c} keys={rig} />
        <div className="rig-sep" /><Controls c={c} keys={fmt} /><Advanced c={c} />{L.runBar}
      </Panel>
      <Panel title="Render queue" icon={Film} className="a-queue">{L.actions}<RenderQueue history={L.history} g={g} select={L.select} /></Panel>
    </div>
  );
}

/* ================================================================== B. Image generation — art-direction artboard */

export function ImageStudio(L: LayoutProps) {
  const { t, c, g } = L;
  const left = ["style", "palette", "composition"].filter((k) => t.params.some((p) => p.key === k));
  const right = t.params.filter((p) => !left.includes(p.key) && !["prompt"].includes(p.key) && p.group !== "advanced").map((p) => p.key);
  const before = c.media.find((m) => m.id === c.v.image);
  const after = g?.outputs[0];
  return (
    <div className="L image">
      <div className="a-prompt">{t.params.some((p) => p.key === "prompt") && <Controls c={c} keys={["prompt"]} flavor="image" compact />}</div>
      {left.length > 0 && <Panel title="Art direction" icon={Brush} className="a-dir"><Controls c={c} keys={left} /></Panel>}
      <div className="a-board artboard">
        {g && before && after && ["compare", "canvas"].includes(t.ui) ? <><Compare before={before} after={after} /><Output g={{ ...g, outputs: [] }} onUse={L.onUse} /></>
          : <Output g={g} onUse={L.onUse} empty={<><ImageIcon size={34} /><span>Your images land on this artboard.</span></>} />}
      </div>
      <Panel title="Light, lens & format" icon={Sun} className="a-side"><Controls c={c} keys={right} /><Consent c={c} /><Advanced c={c} />{L.runBar}</Panel>
      <div className="a-strip">{L.actions}<RenderQueue history={L.history} g={g} select={L.select} /></div>
    </div>
  );
}

/* ================================================================== C. Video transformation — before/after split */

export function TransformStudio(L: LayoutProps) {
  const { c, g, t } = L;
  const before = c.media.find((m) => m.id === c.v.video);
  return (
    <div className="L transform">
      <div className="a-split">
        {g?.outputs[0] && before ? <Compare before={before} after={g.outputs[0]} /> : before ? <div className="split-solo"><MediaView a={before} className="stage-media" /><span className="cmp-tag l">Original</span></div>
          : <div className="out-empty"><SplitSquareHorizontal size={34} /><span>Choose footage — the original and the result appear side by side here.</span></div>}
        <Progress g={g} />{g?.status === "failed" && <div className="error-box">{g.error}</div>}
        {g?.status === "succeeded" && g.result && <Result g={g} onUse={L.onUse} />}
      </div>
      <div className="a-tray"><Controls c={c} skip={[]} />{t.notice && <p className="dim small">{t.notice}</p>}{L.runBar}</div>
      <Panel title="Versions" icon={Layers} className="a-ver">{L.actions}<RenderQueue history={L.history} g={g} select={L.select} horizontal={false} /></Panel>
    </div>
  );
}

/* ================================================================== D. Animation — stage + keyframe lane */

function KeyLane({ t, c }: { t: Tool; c: Ctx }) {
  const dur = Number(c.v.duration || (c.v.text ? (String(c.v.text).split(/\s+/).filter(Boolean).length / Number(c.v.words_per_second || 2.5)) : 5));
  const words = t.id === "038" ? String(c.v.text || "").split(/\s+/).filter(Boolean).slice(0, 40) : [];
  return (
    <div className="keylane">
      <div className="kl-ruler">{Array.from({ length: 6 }).map((_, i) => <span key={i}>{(dur * i / 5).toFixed(1)}s</span>)}</div>
      <div className="kl-track">
        {words.length ? words.map((w, i) => <span key={i} className="kl-key word" style={{ left: `${(i / words.length) * 100}%`, width: `${100 / words.length}%` }}>{w}</span>)
          : <><span className="kl-key" style={{ left: 0 }}>start</span><span className="kl-key end" style={{ right: 0 }}>end</span><i className="kl-path" /></>}
      </div>
    </div>
  );
}

function MotionPath({ move }: { move?: string }) {
  const m: Record<string, [string, string]> = { "push in": ["10% 10% 80% 80%", "30% 30% 40% 40%"], "pull out": ["30% 30% 40% 40%", "10% 10% 80% 80%"],
    "pan left": ["40% 20% 55% 60%", "5% 20% 55% 60%"], "pan right": ["5% 20% 55% 60%", "40% 20% 55% 60%"], "tilt up": ["20% 35% 60% 60%", "20% 5% 60% 60%"], "tilt down": ["20% 5% 60% 60%", "20% 35% 60% 60%"] };
  const [a, b] = m[move ?? ""] ?? ["15% 15% 70% 70%", "15% 15% 70% 70%"];
  const box = (s: string) => { const [l, tp, w, h] = s.split(" "); return { left: l, top: tp, width: w, height: h }; };
  return <div className="motion-path" aria-hidden="true"><i className="mp-a" style={box(a)} /><i className="mp-b" style={box(b)} /></div>;
}

export function AnimationStudio(L: LayoutProps) {
  const { t, c, g } = L;
  const stageIn = c.media.find((m) => m.id === (c.v.image || c.v.video));
  const lib = t.params.filter((p) => ["media", "media_multi"].includes(p.type)).map((p) => p.key);
  const rest = t.params.filter((p) => !lib.includes(p.key) && p.group !== "advanced").map((p) => p.key);
  return (
    <div className="L animation">
      {lib.length > 0 && <Panel title={t.id === "033" ? "Face & voice" : "Library"} icon={PersonStanding} className="a-lib"><Controls c={c} keys={lib} />
        {t.id === "033" && <AlignView c={c} />}<Consent c={c} /></Panel>}
      <div className="a-stage anim-stage">
        {g ? <Output g={g} onUse={L.onUse} single /> : stageIn ? <div className="stage-in"><MediaView a={stageIn} className="stage-media" />{t.id === "039" && <MotionPath move={c.v.move} />}</div>
          : t.output === "model3d" ? <div className="out-empty"><Box size={40} /><span>Your 3D model (GLB) appears here to download.</span></div>
          : <div className="out-empty stage-empty"><span className="stage-floor" /><PersonStanding size={40} /><span>The stage is set.</span></div>}
      </div>
      <div className="a-lane"><KeyLane t={t} c={c} /></div>
      <Panel title="Performance" icon={Gauge} className="a-ctl"><Controls c={c} keys={rest} /><Advanced c={c} />{L.runBar}</Panel>
      <div className="a-q">{L.actions}<RenderQueue history={L.history} g={g} select={L.select} /></div>
    </div>
  );
}

function AlignView({ c }: { c: Ctx }) {
  const v = c.media.find((m) => m.id === c.v.video), a = c.media.find((m) => m.id === c.v.audio);
  const pv = useWave(a?.waveform_url);
  if (!v || !a) return null;
  const max = Math.max(v.duration_s ?? 0, a.duration_s ?? 0) || 1;
  return <div className="align"><div className="al-row"><span>Face</span><i style={{ width: `${((v.duration_s ?? 0) / max) * 100}%` }} /></div>
    <div className="al-row"><span>Voice</span><div style={{ width: `${((a.duration_s ?? 0) / max) * 100}%` }}><Wave peaks={pv} height={26} /></div></div>
    <small className="dim">{Math.abs((v.duration_s ?? 0) - (a.duration_s ?? 0)) > 0.3 ? `Lengths differ by ${Math.abs((v.duration_s ?? 0) - (a.duration_s ?? 0)).toFixed(1)} s — “When lengths differ” decides what happens.` : "Lengths match."}</small></div>;
}

/* ================================================================== E. Audio — multitrack bench */

function Lane({ name, a, color }: { name: string; a?: Asset; color: string }) {
  const peaks = useWave(a?.waveform_url);
  const au = useRef<HTMLAudioElement>(null);
  const [t, setT] = useState(0);
  return (
    <div className="lane" style={{ ["--lane" as any]: color }}>
      <div className="lane-h"><b>{name}</b>{a && <span className="dim ellipsis">{a.filename}</span>}{a && <AiBadge a={a} />}
        {a?.proxy_url && <button type="button" className="btn sm ghost" onClick={() => au.current?.paused ? au.current.play() : au.current?.pause()} aria-label={`Play ${name}`}><Play size={13} /></button>}</div>
      <div className="lane-w">{a ? <Wave peaks={peaks} color={color} height={70} progress={a.duration_s ? t / a.duration_s : 0} onSeek={(f) => { if (au.current && a.duration_s) au.current.currentTime = f * a.duration_s; }} /> : <span className="dim">empty</span>}</div>
      {a?.proxy_url && <audio ref={au} src={a.proxy_url} onTimeUpdate={(e) => setT((e.target as HTMLAudioElement).currentTime)} hidden />}
    </div>
  );
}

export function AudioStudio(L: LayoutProps) {
  const { t, c, g } = L;
  const src = c.media.find((m) => m.id === (c.v.audio || c.v.video));
  const left = ["text", "prompt", "audio", "video", "target_voice"].filter((k) => t.params.some((p) => p.key === k));
  const right = t.params.filter((p) => !left.includes(p.key) && p.group !== "advanced").map((p) => p.key);
  return (
    <div className="L audio">
      <Panel title={t.id === "041" ? "Script" : "Source"} icon={t.id === "042" ? Music2 : Mic2} className="a-src"><Controls c={c} keys={left} flavor="audio" /><Consent c={c} /></Panel>
      <div className="a-bench">
        <div className="bench-h"><AudioLines size={14} /> Multitrack <span className="dim">{g?.status === "succeeded" ? "result on its own track — compare by playing each" : ""}</span></div>
        {src && <Lane name="Source" a={src} color="#64748b" />}
        {(g?.outputs ?? []).map((o, i) => <Lane key={o.id} name={g!.outputs.length > 1 ? `Result ${i + 1}` : "Result"} a={o} color={["#22d3ee", "#a78bfa", "#f472b6", "#facc15"][i % 4]} />)}
        {!src && !g?.outputs.length && <div className="out-empty"><AudioLines size={34} /><span>Tracks appear here.</span></div>}
        <Progress g={g} />{g?.status === "failed" && <div className="error-box">{g.error}</div>}
        {g?.status === "succeeded" && t.id === "050" && <BeatView r={g.result} />}
        {g?.status === "succeeded" && g.result?.before_lufs != null && <div className="rep-kpis"><div className="kpi"><span>Before</span><b>{g.result.before_lufs} LUFS</b></div><div className="kpi"><span>After</span><b>{g.result.after_lufs} LUFS</b></div></div>}
        {g?.status === "succeeded" && g.result?.removed_s != null && <div className="rep-kpis"><div className="kpi"><span>Removed</span><b>{g.result.removed_s}s</b></div><div className="kpi"><span>Cuts</span><b>{g.result.cuts}</b></div></div>}
      </div>
      <Panel title="Sound" icon={Gauge} className="a-knobs"><Controls c={c} keys={right} /><Advanced c={c} />{L.runBar}</Panel>
      <div className="a-q">{L.actions}<RenderQueue history={L.history} g={g} select={L.select} /></div>
    </div>
  );
}

function BeatView({ r }: { r: any }) {
  return <div className="beats"><div className="beats-bpm"><b>{r.bpm}</b><span>BPM</span><small>confidence {r.confidence}</small></div>
    <div className="beats-grid">{r.beats.slice(0, 64).map((b: number, i: number) => <i key={i} className={i % 4 === 0 ? "bar" : ""} style={{ left: `${(b / r.duration_s) * 100}%` }} />)}</div>
    <small className="dim">{r.beats.length} beats over {r.duration_s}s — cut on the markers for on-beat edits.</small></div>;
}

/* ================================================================== F. Writing — writer's room */

export function WritingStudio(L: LayoutProps) {
  const { c, g } = L;
  const r = g?.result;
  const outline: string[] = r?.scenes?.map((s: any) => s.heading) ?? r?.beats?.map((b: any) => b.name) ?? r?.items?.map((x: any) => x.text.slice(0, 40)) ?? r?.shots?.map((s: any) => s.prompt.slice(0, 40)) ?? [];
  return (
    <div className="L writing">
      <Panel title="Creative brief" icon={PenLine} className="a-brief"><Controls c={c} compact />{L.runBar}</Panel>
      <div className="a-paper paper">
        <Output g={g} onUse={L.onUse} empty={<><PenLine size={34} /><span>Your draft appears on this page. Every run is a new version you can return to.</span></>} />
      </div>
      <Panel title="Structure & versions" icon={ListOrdered} className="a-struct">
        {outline.length > 0 && <ol className="struct">{outline.map((o, i) => <li key={i}>{o}</li>)}</ol>}
        {L.actions}<RenderQueue history={L.history} g={g} select={L.select} horizontal={false} />
      </Panel>
    </div>
  );
}

/* ================================================================== G. Content intelligence — analysis workspace */

export function ContentStudio(L: LayoutProps) {
  const { c, g } = L;
  const v = useRef<HTMLVideoElement>(null);
  const [now, setNow] = useState(0);
  const src = c.media.find((m) => m.id === c.v.video);
  const seek = (s: number) => { if (v.current) { v.current.currentTime = s; v.current.play().catch(() => {}); } };
  const scenes = (src?.analysis as any)?.scenes ?? [];
  const r = g?.result;
  const marks = r?.flags?.map((f: any) => ({ t: f.t, kind: "flag", sev: f.severity, label: f.issue })) ?? r?.highlights?.map((h: any) => ({ t: h.start, end: h.end, kind: "hl" }))
    ?? scenes.map((s: any) => ({ t: s.start, kind: "scene" }));
  return (
    <div className="L content">
      <div className="a-player scan">{src ? <MediaView a={src} vref={v} onTime={setNow} className="stage-media" /> : <div className="out-empty"><ScanSearch size={34} /><span>Choose media to analyse.</span></div>}
        <span className="scan-line" aria-hidden="true" /></div>
      <div className="a-tl">{src?.duration_s ? <Timebar dur={src.duration_s} marks={marks} curve={r?.curve} onSeek={seek} /> : null}
        {src?.duration_s ? <div className="playhead" style={{ left: `${(now / src.duration_s) * 100}%` }} /> : null}</div>
      <Panel title="Findings" icon={ScanSearch} className="a-find">
        <div className="row wrap"><Controls c={c} compact /></div>{L.runBar}
        <Progress g={g} />{g?.status === "failed" && <div className="error-box">{g.error}</div>}
        {g?.status === "succeeded" && (r?.kind === "transcript" ? <TranscriptView segs={r.segments} seek={seek} srt={r.srt} lang={r.language} now={now} /> : <Result g={g} seek={seek} onUse={L.onUse} />)}
      </Panel>
      <div className="a-q">{L.actions}<RenderQueue history={L.history} g={g} select={L.select} /></div>
    </div>
  );
}

/* ================================================================== H. Creator intelligence — strategy control center */

export function CreatorStudio(L: LayoutProps) {
  const { c, g } = L;
  return (
    <div className="L creator">
      <div className="a-query"><Controls c={c} compact />{L.runBar}</div>
      <div className="a-dash">
        <Output g={g} onUse={L.onUse} empty={<><TrendingUp size={34} /><span>Research results build a dashboard here — every number links to the data it came from.</span></>} />
      </div>
      <Panel title="Saved research" icon={ListOrdered} className="a-saved">{L.actions}<RenderQueue history={L.history} g={g} select={L.select} horizontal={false} /></Panel>
    </div>
  );
}

/* ================================================================== I. Image editing — canvas + layers */

export function ImageEditStudio(L: LayoutProps) {
  const { t, c, g } = L;
  const base = c.media.find((m) => m.id === c.v.image);
  const [view, setView] = useState<"edit" | "compare">("edit");
  useEffect(() => { if (g?.outputs[0]) setView("compare"); }, [g?.id, g?.outputs.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const tools = t.params.filter((p) => !["image", "mask"].includes(p.key) && p.group !== "advanced").map((p) => p.key);
  const hasMask = t.params.some((p) => p.key === "mask");
  return (
    <div className="L imageedit">
      <div className="a-rail">{["image"].map((k) => <Control key={k} p={t.params.find((p) => p.key === k)!} c={c} />)}</div>
      <div className="a-canvas checker">
        <div className="seg canvas-seg"><button type="button" className={view === "edit" ? "on" : ""} onClick={() => setView("edit")}>{hasMask ? "Paint mask" : "Original"}</button>
          <button type="button" className={view === "compare" ? "on" : ""} disabled={!g?.outputs[0]} onClick={() => setView("compare")}>Before / after</button></div>
        {view === "compare" && base && g?.outputs[0] ? <Compare before={base} after={g.outputs[0]} />
          : hasMask ? <Control p={t.params.find((p) => p.key === "mask")!} c={c} />
          : base ? <MediaView a={base} className="stage-media" /> : <div className="out-empty"><Brush size={34} /><span>Choose an image to start.</span></div>}
        <Progress g={g} />{g?.status === "failed" && <div className="error-box">{g.error}</div>}
      </div>
      <Panel title="Adjust" icon={Layers} className="a-layers">
        <Controls c={c} keys={tools} /><Consent c={c} />{L.runBar}
        <div className="layers">
          <div className="layer-row"><Thumb a={base} size={46} /><span>Original</span></div>
          {L.history.filter((h) => h.outputs[0]).slice(0, 8).map((h) => <button type="button" key={h.id} className={`layer-row ${h.id === g?.id ? "on" : ""}`} onClick={() => L.select(h.id)}><Thumb a={h.outputs[0]} size={46} /><span>Version {h.version}</span></button>)}
        </div>{L.actions}
      </Panel>
    </div>
  );
}

/* ================================================================== J. Video intelligence — shot timeline + versions */

export function VideoIntelStudio(L: LayoutProps) {
  const { c, g } = L;
  const src = c.media.find((m) => m.id === c.v.video);
  const v = useRef<HTMLVideoElement>(null);
  const scenes = (src?.analysis as any)?.scenes ?? [];
  const seek = (s: number) => { if (v.current) v.current.currentTime = s; };
  const fmt: string | undefined = c.v.format;
  return (
    <div className="L videointel">
      <div className="a-prev">{src ? <div className="reframe-wrap"><MediaView a={src} vref={v} className="stage-media" />{fmt && fmt !== "16:9" && <ReframeGuide fmt={fmt} sx={(src.analysis as any)?.subject_center_x} />}</div>
        : <div className="out-empty"><BrainCircuit size={34} /><span>Choose a video — shots, subjects and versions show up here.</span></div>}</div>
      <div className="a-shots">{src?.duration_s ? <div className="shot-tl">{scenes.map((s: any, i: number) => <button type="button" key={i} className="shot-seg" title={`${mmss(s.start)}–${mmss(s.end)}`}
        style={{ left: `${(s.start / src.duration_s!) * 100}%`, width: `${((s.end - s.start) / src.duration_s!) * 100}%` }} onClick={() => seek(s.start)}>{i + 1}</button>)}</div> : null}</div>
      <Panel title="Intelligent edit" icon={BrainCircuit} className="a-ctl"><Controls c={c} keys={c.tool.params.filter((p) => p.key !== "video").map((p) => p.key)} />{L.runBar}</Panel>
      <Panel title="Output versions" icon={Layers} className="a-out"><Output g={g} onUse={L.onUse} seek={seek} empty={<span className="dim">New sequences appear here — open any of them in the editor.</span>} />
        {L.actions}<RenderQueue history={L.history} g={g} select={L.select} horizontal={false} /></Panel>
      <div className="a-pick"><Control p={c.tool.params.find((p) => p.key === "video")!} c={c} /></div>
    </div>
  );
}

function ReframeGuide({ fmt, sx = 0.5 }: { fmt: string; sx?: number }) {
  const [w, h] = fmt.split(":").map(Number);
  const frac = Math.min(1, (w / h) / (16 / 9));
  const left = Math.max(0, Math.min(1 - frac, (sx ?? 0.5) - frac / 2));
  return <div className="reframe" aria-hidden="true"><i style={{ left: `${left * 100}%`, width: `${frac * 100}%` }} /><span style={{ left: `${left * 100}%` }}>{fmt} crop follows the subject</span></div>;
}

/* ================================================================== K. Localization — production desk */

export function LocalizeStudio(L: LayoutProps) {
  const { c, g, t } = L;
  const src = c.media.find((m) => m.id === c.v.video);
  const v = useRef<HTMLVideoElement>(null);
  const [now, setNow] = useState(0);
  const seek = (s: number) => { if (v.current) { v.current.currentTime = s; v.current.play().catch(() => {}); } };
  const tr = (src?.analysis as any)?.transcript;
  const right = t.params.filter((p) => !["video"].includes(p.key)).map((p) => p.key);
  return (
    <div className="L localize">
      <Panel title="Original" icon={Film} className="a-orig">{t.params.some((p) => p.key === "video") && <Control p={t.params.find((p) => p.key === "video")!} c={c} />}
        {src && <MediaView a={src} vref={v} onTime={setNow} className="stage-media" />}
        {tr?.segments && <TranscriptView segs={tr.segments} seek={seek} now={now} lang={tr.language} />}</Panel>
      <div className="a-tracks">
        <div className="bench-h"><Languages size={14} /> Language tracks</div>
        {g?.outputs.map((o) => <Lane key={o.id} name={o.filename.includes("dub") ? "Dub" : "Result"} a={o} color="#34d399" />)}
        <Output g={g} seek={seek} onUse={L.onUse} empty={<><Languages size={34} /><span>Subtitles, translations and dubs appear here as tracks you can edit and download.</span></>} />
      </div>
      <Panel title="Languages & voice" icon={Languages} className="a-lang"><Controls c={c} keys={right} /><Consent c={c} />{L.runBar}{L.actions}
        <RenderQueue history={L.history} g={g} select={L.select} horizontal={false} /></Panel>
    </div>
  );
}

/* ================================================================== L. Automation — node canvas */

export function AutomationStudio(L: LayoutProps) {
  const { c, g, t } = L;
  const graph: Graph = c.v.graph ?? { nodes: [], edges: [] };
  const canvas = ["111", "117", "118"].includes(t.id);
  if (t.id === "119") return (
    <div className="L writing">
      <Panel title="Brief for the Director Agent" icon={BrainCircuit} className="a-brief"><Controls c={c} />{L.runBar}</Panel>
      <div className="a-paper paper"><Output g={g} onUse={L.onUse} empty={<><BrainCircuit size={34} /><span>The agent drafts a workflow from real tools only. You review it on the canvas before anything runs.</span></>} /></div>
      <Panel title="Plans" icon={ListOrdered} className="a-struct">{L.actions}<RenderQueue history={L.history} g={g} select={L.select} horizontal={false} /></Panel>
    </div>);
  return (
    <div className="L automation">
      <div className="a-top">
        {t.params.filter((p) => !["graph"].includes(p.key)).map((p) => <Control key={p.key} p={p} c={c} compact />)}
        {L.runBar}
      </div>
      <div className="a-canvas">
        {canvas ? <NodeCanvas graph={graph} onChange={(x) => c.set("graph", x)} tools={L.tools} studios={L.studios} gen={g} c={c} />
          : <TemplatePreview t={t} gen={g} tools={L.tools} />}
      </div>
      <div className="a-mon">
        <Output g={g} onUse={L.onUse} empty={<span className="dim">Run history and per-step results appear here.</span>} />
        {g?.result?.state?.results && <div className="wf-steps">{Object.entries(g.result.state.results).map(([k, r]: any) => <div key={k} className="wf-step"><b>{k}</b><span className="dim">{r.assets?.length ?? 0} file(s){r.sequences?.length ? `, ${r.sequences.length} sequence(s)` : ""}</span></div>)}</div>}
        {L.actions}<RenderQueue history={L.history} g={g} select={L.select} />
      </div>
    </div>
  );
}

function TemplatePreview({ t, gen, tools }: { t: Tool; gen: Generation | null; tools: Tool[] }) {
  const tpl = useMemo(() => ({ "112": "long_to_shorts", "113": "faceless", "114": "podcast_clips", "115": "auto_localize" } as Record<string, string>)[t.id], [t.id]);
  const [g, setG] = useState<Graph | null>(null);
  useEffect(() => { import("../api").then(({ api }) => api<any[]>("/ai/workflow-templates").then((ts) => {
    const x = ts.find((q) => q.id === tpl) ?? null;
    setG(x ? { nodes: x.nodes, edges: x.edges } : null);
    if (t.id === "120") setG(null);
  })).catch(() => {}); }, [tpl, t.id]);
  if (t.id === "120") return <TemplateGallery />;
  if (!g) return null;
  return <NodeCanvas graph={g} onChange={() => {}} tools={tools} studios={[]} gen={gen} c={{} as Ctx} />;
}

function TemplateGallery() {
  const [ts, setTs] = useState<any[]>([]);
  useEffect(() => { import("../api").then(({ api }) => api<any[]>("/ai/workflow-templates").then(setTs)).catch(() => {}); }, []);
  return <div className="tpl-gallery">{ts.map((x) => <Link key={x.id} className="tpl-card" to="/ai-generator/tool/111" onClick={() => { try { sessionStorage.setItem("cu.wf.load", JSON.stringify({ nodes: x.nodes, edges: x.edges })); } catch { /* storage off */ } }}>
    <Workflow size={18} /><b>{x.name}</b><span className="dim">{x.nodes.map((n: any) => n.tool_id === "input" ? "input" : n.tool_id).join(" → ")}</span><span className="btn sm">Open in builder</span></Link>)}</div>;
}

export const LAYOUTS: Record<string, (L: LayoutProps) => JSX.Element> = {
  video: VideoStudio, image: ImageStudio, transform: TransformStudio, animation: AnimationStudio, audio: AudioStudio, writing: WritingStudio,
  content: ContentStudio, creator: CreatorStudio, imageedit: ImageEditStudio, videointel: VideoIntelStudio, localize: LocalizeStudio, automation: AutomationStudio,
};
