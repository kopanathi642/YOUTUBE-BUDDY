import { ReactNode, useEffect, useRef, useState } from "react";
import { Download, Sparkles, AlertTriangle, CheckCircle2, XCircle, Copy, Box, ExternalLink } from "lucide-react";
import { Asset } from "../api";
import { download, Generation, mmss, saveText } from "./core";

/* ------------------------------------------------------------------ media */

export function AiBadge({ a }: { a: Asset }) {
  return (a.analysis as any)?.ai_generated ? <span className="ai-badge" title="Labelled as AI-generated (visible label + file metadata)"><Sparkles size={11} />AI-generated</span> : null;
}

export function MediaView({ a, className, controls = true, autoPlay, loop, muted, onTime, vref }: {
  a?: Asset; className?: string; controls?: boolean; autoPlay?: boolean; loop?: boolean; muted?: boolean; onTime?: (t: number) => void; vref?: React.Ref<HTMLVideoElement>;
}) {
  if (!a) return <div className={`mv empty ${className ?? ""}`} />;
  if (a.status !== "ready") return <div className={`mv processing ${className ?? ""}`}><span className="spinner" /><span>{a.status === "failed" ? a.status_detail || "failed" : "preparing preview…"}</span></div>;
  if (a.kind === "video") return <video ref={vref} className={`mv ${className ?? ""}`} src={a.proxy_url ?? undefined} poster={a.thumbnail_url ?? undefined} controls={controls}
    autoPlay={autoPlay} loop={loop} muted={muted} playsInline onTimeUpdate={(e) => onTime?.((e.target as HTMLVideoElement).currentTime)} />;
  if (a.kind === "image") return <img className={`mv ${className ?? ""}`} src={a.proxy_url ?? undefined} alt={a.filename} />;
  return <AudioView a={a} className={className} />;
}

export function useWave(url?: string | null) {
  const [w, setW] = useState<number[] | null>(null);
  useEffect(() => { if (!url) return; fetch(url).then((r) => r.json()).then((j) => setW(j.peaks)).catch(() => setW(null)); }, [url]);
  return w;
}

export function Wave({ peaks, progress = 0, color = "var(--accent)", height = 64, onSeek }: { peaks: number[] | null; progress?: number; color?: string; height?: number; onSeek?: (f: number) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c || !peaks) return;
    const W = (c.width = c.clientWidth * devicePixelRatio), H = (c.height = height * devicePixelRatio);
    const g = c.getContext("2d")!; g.clearRect(0, 0, W, H);
    const n = Math.min(peaks.length, Math.floor(W / 2));
    const cs = getComputedStyle(c);
    for (let i = 0; i < n; i++) {
      const v = Math.max(...peaks.slice(Math.floor((i * peaks.length) / n), Math.floor(((i + 1) * peaks.length) / n)).concat(0.01));
      g.fillStyle = i / n < progress ? cs.getPropertyValue("--wave-on") || "#fff" : cs.getPropertyValue("--wave-off") || "#666";
      const bh = Math.max(2, v * H * 0.95);
      g.fillRect(i * 2 * (W / (n * 2)), (H - bh) / 2, Math.max(1, W / n - 1), bh);
    }
  }, [peaks, progress, height]);
  return <canvas ref={ref} className="aiwave" style={{ height, ["--wave-on" as any]: color }} onClick={(e) => { const b = (e.target as HTMLElement).getBoundingClientRect(); onSeek?.((e.clientX - b.left) / b.width); }} />;
}

export function AudioView({ a, className }: { a: Asset; className?: string }) {
  const peaks = useWave(a.waveform_url);
  const au = useRef<HTMLAudioElement>(null);
  const [t, setT] = useState(0);
  return (
    <div className={`audio-view ${className ?? ""}`}>
      <Wave peaks={peaks} progress={a.duration_s ? t / a.duration_s : 0} onSeek={(f) => { if (au.current && a.duration_s) au.current.currentTime = f * a.duration_s; }} />
      <audio ref={au} src={a.proxy_url ?? undefined} controls onTimeUpdate={(e) => setT((e.target as HTMLAudioElement).currentTime)} />
    </div>
  );
}

/** Before/after with a draggable divider. Videos play in sync. */
export function Compare({ before, after, label = ["Original", "Result"] }: { before?: Asset; after?: Asset; label?: [string, string] }) {
  const [x, setX] = useState(50);
  const a = useRef<HTMLVideoElement>(null), b = useRef<HTMLVideoElement>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const A = a.current, B = b.current; if (!A || !B) return;
    const sync = () => { if (Math.abs(A.currentTime - B.currentTime) > 0.15) B.currentTime = A.currentTime; };
    const play = () => B.play().catch(() => {}), pause = () => B.pause();
    A.addEventListener("timeupdate", sync); A.addEventListener("play", play); A.addEventListener("pause", pause);
    return () => { A.removeEventListener("timeupdate", sync); A.removeEventListener("play", play); A.removeEventListener("pause", pause); };
  }, [before?.id, after?.id]);
  if (!before || !after) return <MediaView a={after ?? before} className="stage-media" />;
  const isVid = before.kind === "video" && after.kind === "video";
  const move = (e: React.PointerEvent) => { const r = box.current!.getBoundingClientRect(); setX(Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100))); };
  return (
    <div className="compare" ref={box} onPointerMove={(e) => e.buttons && move(e)} onPointerDown={move}>
      {isVid ? <video ref={a} src={before.proxy_url ?? undefined} className="cmp-a" playsInline muted loop controls /> : <img src={before.proxy_url ?? undefined} className="cmp-a" alt="" />}
      <div className="cmp-b" style={{ clipPath: `inset(0 0 0 ${x}%)` }}>
        {isVid ? <video ref={b} src={after.proxy_url ?? undefined} playsInline muted loop /> : <img src={after.proxy_url ?? undefined} alt="" />}
      </div>
      <div className="cmp-line" style={{ left: `${x}%` }}><span>⟷</span></div>
      <span className="cmp-tag l">{label[0]}</span><span className="cmp-tag r">{label[1]}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ helpers */

export function Copyable({ text, children }: { text: string; children?: ReactNode }) {
  const [ok, setOk] = useState(false);
  return <button type="button" className="btn sm ghost" onClick={() => { navigator.clipboard?.writeText(text); setOk(true); setTimeout(() => setOk(false), 1200); }}>
    <Copy size={13} />{ok ? "Copied" : children ?? "Copy"}</button>;
}

function Score({ v, max = 10 }: { v: number; max?: number }) {
  return <span className="score"><i style={{ width: `${(Number(v) / max) * 100}%` }} /><b>{v}</b></span>;
}

export function Timebar({ dur, marks, onSeek, curve }: { dur: number; marks: { t: number; end?: number; kind?: string; label?: string; sev?: string }[]; onSeek?: (t: number) => void; curve?: { t: number; score: number }[] }) {
  return (
    <div className="timebar" role="list" aria-label="Timeline of findings">
      {curve && <svg className="tb-curve" viewBox={`0 0 ${dur} 1`} preserveAspectRatio="none" aria-hidden="true">
        <path d={"M0 1 " + curve.map((c) => `L${c.t} ${1 - Math.min(1, c.score)}`).join(" ") + ` L${dur} 1Z`} /></svg>}
      {marks.map((m, i) => <button type="button" role="listitem" key={i} className={`tb-mark ${m.kind ?? ""} ${m.sev ?? ""}`} title={m.label}
        style={{ left: `${(m.t / dur) * 100}%`, width: m.end ? `${Math.max(0.6, ((m.end - m.t) / dur) * 100)}%` : undefined }} onClick={() => onSeek?.(m.t)} />)}
      <div className="tb-ticks">{Array.from({ length: 6 }).map((_, i) => <span key={i}>{mmss((dur * i) / 5)}</span>)}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ report & document renderers */

export function Result({ g, seek, onUse }: { g: Generation; seek?: (t: number) => void; onUse?: (k: string, v: any) => void }) {
  const r = g.result || {};
  const k = r.kind;
  if (g.files?.length) return <Files g={g} />;
  switch (k) {
    case "scenes": return <div className="rep">
      <div className="rep-kpis"><Kpi l="Shots" v={r.summary.count} /><Kpi l="Average shot" v={`${r.summary.avg_shot_s}s`} /><Kpi l="Longest" v={`${r.summary.longest_s}s`} /></div>
      <div className="scene-strip">{r.scenes.map((s: any, i: number) => <button key={i} type="button" className="scene" onClick={() => seek?.(s.start)}>
        {s.thumb && <img src={s.thumb} alt="" />}<span>{mmss(s.start)} · {s.length}s</span></button>)}</div></div>;
    case "faces": return <div className="rep"><div className="rep-kpis"><Kpi l="Frames with faces" v={`${r.summary.frames_with_faces}/${r.summary.frames}`} /><Kpi l="Most faces in a frame" v={r.summary.max_faces} /></div>
      <div className="face-grid">{r.samples.map((s: any, i: number) => <button type="button" key={i} className="face-cell" onClick={() => seek?.(s.t)}>
        <img src={s.thumb} alt="" />{s.boxes.map((b: any, j: number) => <i key={j} style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%` }} />)}
        <span>{mmss(s.t)}</span></button>)}</div></div>;
    case "highlights": return <div className="rep">
      <Timebar dur={r.duration_s} curve={r.curve} marks={r.highlights.map((h: any) => ({ t: h.start, end: h.end, kind: "hl", label: `score ${h.score}` }))} onSeek={seek} />
      <div className="scene-strip">{r.highlights.map((h: any, i: number) => <button type="button" key={i} className="scene hl" onClick={() => seek?.(h.start)}>
        {h.thumb && <img src={h.thumb} alt="" />}<span>#{i + 1} · {mmss(h.start)}–{mmss(h.end)} · {h.score}</span></button>)}</div>
      <p className="dim small">{r.method}</p></div>;
    case "retention": case "continuity": return <div className="rep">
      {r.summary && <div className="rep-kpis"><Kpi l="Cuts / min" v={r.summary.cuts_per_minute} /><Kpi l="Silence" v={`${r.summary.silence_s}s`} /><Kpi l="Flags" v={r.summary.flags} /></div>}
      {r.duration_s && <Timebar dur={r.duration_s} marks={r.flags.map((f: any) => ({ t: f.t, kind: "flag", sev: f.severity, label: f.issue }))} onSeek={seek} />}
      <ul className="findings">{r.flags.map((f: any, i: number) => <li key={i} className={f.severity}><button type="button" onClick={() => seek?.(f.t)}>{mmss(f.t)}</button>
        <div><b>{f.issue}</b><small>Evidence: {f.evidence}{f.fix ? ` · Fix: ${f.fix}` : ""}</small></div></li>)}
        {!r.flags.length && <li className="ok"><CheckCircle2 size={14} /> Nothing flagged.</li>}</ul>
      {r.note && <p className="dim small">{r.note}</p>}</div>;
    case "audio": return <div className="rep"><div className="rep-kpis"><Kpi l="Loudness" v={r.integrated_lufs != null ? `${r.integrated_lufs} LUFS` : "—"} /><Kpi l="True peak" v={r.true_peak != null ? `${r.true_peak} dBTP` : "—"} /><Kpi l="Range" v={r.lra != null ? `${r.lra} LU` : "—"} /></div>
      <LoudMeter v={r.integrated_lufs} />
      <ul className="checks">{r.checks.map((c: any) => <li key={c.name}>{c.pass ? <CheckCircle2 size={15} className="ok" /> : <XCircle size={15} className="bad" />}<span>{c.name}</span><code>{c.value ?? "—"}</code></li>)}</ul></div>;
    case "visual": return <div className="rep"><div className="rep-kpis"><Kpi l="Scenes" v={r.summary.scenes} /><Kpi l="With issues" v={r.summary.with_issues} /></div>
      <table className="rep-t"><thead><tr><th /><th>Time</th><th>Bright</th><th>Contrast</th><th>Sharp</th><th>Issues</th></tr></thead><tbody>
        {r.scenes.map((s: any, i: number) => <tr key={i} onClick={() => seek?.(s.start)}><td>{s.thumb && <img src={s.thumb} alt="" />}</td><td>{mmss(s.start)}</td><td>{s.brightness}</td><td>{s.contrast}</td><td>{s.sharpness}</td>
          <td>{s.issues.length ? s.issues.map((x: string) => <span key={x} className="badge warn">{x}</span>) : <span className="badge ok">good</span>}</td></tr>)}</tbody></table></div>;
    case "thumb_ab": return <div className="rep"><div className="ab-grid">{r.rows.map((x: any, i: number) => <div key={x.asset_id} className={`ab-card ${i === 0 ? "win" : ""}`}>
      {i === 0 && <span className="badge ok">strongest</span>}<b>{x.name}</b><div className="ab-score">{x.score}</div>
      <dl><dt>Small-size contrast</dt><dd>{x.small_contrast}</dd><dt>Faces</dt><dd>{x.faces} ({x.largest_face_pct}%)</dd><dt>Saturation</dt><dd>{x.saturation}</dd><dt>Clutter</dt><dd>{x.busyness}</dd></dl></div>)}</div>
      <p className="dim small">{r.method}</p></div>;
    case "tracking": return <div className="rep"><div className="rep-kpis"><Kpi l="Face found in" v={`${Math.round(r.coverage * 100)}% of frames`} /></div>
      <svg viewBox="0 0 160 90" className="track-plot" aria-label="Subject path">{r.path.length > 1 && <polyline points={r.path.map((p: any) => `${p.cx * 160},${p.cy * 90}`).join(" ")} />}
        {r.path.map((p: any, i: number) => <circle key={i} cx={p.cx * 160} cy={p.cy * 90} r={1.2 + p.size * 8} />)}</svg>
      <div className="scene-strip">{r.frames.map((f: any, i: number) => <button key={i} type="button" className="scene" onClick={() => seek?.(f.t)}><img src={f.thumb} alt="" /><span>{mmss(f.t)}</span></button>)}</div></div>;
    case "safety": return <div className="rep"><div className={`verdict ${r.verdict.startsWith("review") ? "bad" : "ok"}`}>{r.verdict}</div>
      <div className="rep-kpis">{r.frames.map((f: any) => <Kpi key={f.t} l={mmss(f.t)} v={f.nsfw_probability != null ? `${Math.round(f.nsfw_probability * 100)}%` : "—"} />)}</div><p className="dim small">{r.note}</p></div>;
    case "transcript": return <TranscriptView segs={r.segments} seek={seek} srt={r.srt} lang={r.language} />;
    case "subtitles": return <SubtitleTracks r={r} seek={seek} />;
    case "compare": return r.rows?.[0]?.source !== undefined ? <div className="rep"><table className="rep-t cmp-t"><thead><tr><th>Time</th><th>Original</th><th>{r.a_engine}</th><th>{r.b_engine}</th></tr></thead>
      <tbody>{r.rows.map((x: any, i: number) => <tr key={i} onClick={() => seek?.(x.start)}><td>{mmss(x.start)}</td><td>{x.source}</td><td>{x.a}</td><td>{x.b}</td></tr>)}</tbody></table></div> : <YtRows rows={r.rows} />;
    case "chapters": return <div className="rep doc"><h3>Chapters</h3><ol className="chapters">{(r.chapters || []).map((c: any, i: number) => <li key={i}><button type="button" onClick={() => seek?.(c.t)}>{mmss(c.t)}</button> {c.title}</li>)}</ol>
      <pre className="pre">{(r.chapters || []).map((c: any) => `${mmss(c.t)} ${c.title}`).join("\n")}</pre><Copyable text={(r.chapters || []).map((c: any) => `${mmss(c.t)} ${c.title}`).join("\n")}>Copy for YouTube</Copyable></div>;
    case "broll": return <div className="rep"><ul className="findings">{(r.suggestions || []).map((s: any, i: number) => <li key={i}><button type="button" onClick={() => seek?.(s.start)}>{mmss(s.start)}</button>
      <div><b>{s.show}</b><small>{s.why}{s.library_asset_id ? " · from your library" : s.generate_prompt ? ` · generate: “${s.generate_prompt}”` : ""}</small></div></li>)}</ul></div>;
    case "beats": return null;
    case "storyboard": return null;
    case "script": return <div className="rep doc script-doc"><h2>{r.title}</h2>{r.logline && <p className="logline">{r.logline}</p>}
      {(r.scenes || []).map((s: any, i: number) => <section key={i} className="script-scene"><h4><span>{String(i + 1).padStart(2, "0")}</span>{s.heading}<em>{s.duration_s}s</em></h4>
        <p className="narr">{s.narration}</p><p className="vis"><b>Visuals:</b> {s.visuals}</p>{s.on_screen_text && <p className="ost"><b>On screen:</b> {s.on_screen_text}</p>}
        {onUse && <button type="button" className="btn sm" onClick={() => onUse("prompt", s.visuals)}>Use as video prompt</button>}</section>)}
      {r.cta && <p className="cta"><b>Call to action:</b> {r.cta}</p>}<DocActions g={g} /></div>;
    case "hooks": case "titles": case "prompt": case "social": return <div className="rep"><ol className="items">{(r.items || []).map((x: any, i: number) => <li key={i}>
      <div className="item-main"><b>{x.text}</b>{x.platform && <span className="badge">{x.platform}</span>}{x.hashtags && <small>{x.hashtags.join(" ")}</small>}{(x.why || x.technique) && <small>{x.technique ? `${x.technique} · ` : ""}{x.why}</small>}</div>
      <div className="item-scores">{x.score != null && <Score v={x.score} />}{x.curiosity != null && <><Score v={x.curiosity} /><Score v={x.clarity} /></>}{x.chars != null && <span className="dim">{x.chars} ch</span>}</div>
      <Copyable text={x.text + (x.hashtags ? "\n" + x.hashtags.join(" ") : "")} /></li>)}</ol><DocActions g={g} /></div>;
    case "description": return <div className="rep doc"><pre className="pre">{r.description}</pre><Copyable text={r.description}>Copy description</Copyable>
      <div className="tags">{(r.tags || []).map((t: string) => <span key={t} className="badge">{t}</span>)}</div><Copyable text={(r.tags || []).join(", ")}>Copy tags</Copyable>
      <div className="tags">{(r.hashtags || []).map((t: string) => <span key={t} className="badge info">{t}</span>)}</div></div>;
    case "outline": return <div className="rep doc"><h2>{r.title}</h2><div className="beats-board">{(r.beats || []).map((b: any, i: number) =>
      <div key={i} className="beat-card"><span className="beat-n">{i + 1}</span><b>{b.name}</b><p>{b.summary}</p><small>{b.purpose}{b.minutes ? ` · ~${b.minutes} min` : ""}</small></div>)}</div><DocActions g={g} /></div>;
    case "dialogue": return <div className="rep doc screenplay"><h2>{r.title}</h2><p className="setting">{r.setting}</p>
      {(r.lines || []).map((l: any, i: number) => <div key={i} className="sp-line"><div className="sp-char">{l.character}</div>{l.direction && <div className="sp-dir">({l.direction})</div>}<div className="sp-text">{l.line}</div></div>)}<DocActions g={g} /></div>;
    case "shotlist": return <div className="rep"><table className="rep-t"><thead><tr><th>#</th><th>Shot</th><th>Camera</th><th>Lens</th><th>s</th></tr></thead><tbody>
      {(r.shots || []).map((s: any, i: number) => <tr key={i}><td>{i + 1}</td><td>{s.prompt}<small className="dim">{s.narration}</small></td><td>{s.camera_move} · {s.camera_angle}</td><td>{s.lens}</td><td>{s.duration}</td></tr>)}</tbody></table>
      {onUse && <button type="button" className="btn primary" onClick={() => onUse("_to_film", r.shots)}>Send to Multi-Shot Film Builder</button>}<DocActions g={g} /></div>;
    case "rewrite": return <div className="rep doc"><pre className="pre">{r.text}</pre><Copyable text={r.text} /><ul>{(r.changes || []).map((c: string) => <li key={c} className="dim">{c}</li>)}</ul></div>;
    case "title_ab": return <div className="rep"><div className="verdict ok">Winner: {r.winner}</div><p className="dim">{r.why}</p><ol className="items">{(r.items || []).map((x: any, i: number) =>
      <li key={i}><div className="item-main"><b>{x.text}</b><small>{x.verdict}</small></div><div className="item-scores"><Score v={x.clarity} /><Score v={x.curiosity} /><Score v={x.specificity} /></div></li>)}</ol></div>;
    case "seo": return <div className="rep"><div className="gauge"><svg viewBox="0 0 120 70"><path d="M10 60a50 50 0 0 1 100 0" className="g-bg" /><path d="M10 60a50 50 0 0 1 100 0" className="g-fg" style={{ strokeDasharray: `${(r.score / 100) * 157} 157` }} /></svg><b>{r.score}</b></div>
      <ul className="checks">{(r.checks || []).map((c: any) => <li key={c.name}>{c.pass ? <CheckCircle2 size={15} className="ok" /> : <XCircle size={15} className="bad" />}<span>{c.name}<small className="dim"> — {c.detail}</small></span></li>)}</ul>
      {r.improved_title && <p><b>Better title:</b> {r.improved_title} <Copyable text={r.improved_title} /></p>}</div>;
    case "calendar": return <div className="rep"><div className="cal">{(r.weeks || []).map((w: any) => <div key={w.week} className="cal-week"><b>Week {w.week}</b>
      {(w.items || []).map((x: any, i: number) => <div key={i} className="cal-item"><span className="badge">{x.day}</span><b>{x.title}</b><small>{x.format} · {x.hook}</small></div>)}</div>)}</div><DocActions g={g} /></div>;
    case "channel": case "strategy": return <div className="rep">{r.channel && <div className="rep-kpis"><Kpi l={r.channel.title} v={`${r.channel.subscribers.toLocaleString()} subs`} />
      <Kpi l="Avg views (recent)" v={r.stats.avg_views_recent.toLocaleString()} /><Kpi l="Shorts share" v={`${Math.round(r.stats.shorts_share * 100)}%`} /></div>}
      {r.stats?.top && <YtRows rows={r.stats.top.map((v: any) => ({ title: v.title, views: v.views }))} />}
      <p>{r.summary}</p><ul className="findings">{(r.findings || []).map((f: any, i: number) => <li key={i}><div><b>{f.finding}</b><small>Evidence: {f.evidence}</small></div></li>)}</ul>
      <ul className="findings">{(r.actions || []).map((a: any, i: number) => <li key={i} className={a.priority}><div><b>{a.action}</b><small>{a.priority} · {a.why}</small></div></li>)}</ul></div>;
    case "trends": return <YtRows rows={r.rows} />;
    case "topics": case "opportunity": return <div className="rep"><OppMap topics={r.topics || []} /><ul className="findings">{(r.topics || []).map((t: any, i: number) =>
      <li key={i}><div><b>{t.topic}</b><small>demand {t.demand} · competition {t.competition} · {t.angle}</small><small className="dim">{(t.evidence || []).slice(0, 2).join(" · ")}</small></div></li>)}</ul></div>;
    case "workflow_plan": return <div className="rep"><p>{r.summary}</p><p className="dim">Estimated model spend: ${r.est_cost_usd ?? 0}</p>
      {onUse && <button type="button" className="btn primary" onClick={() => onUse("_to_workflow", r.graph)}>Open in Workflow Builder</button>}</div>;
    case "workflow": case "batch": case "templates": return null;
    default: {
      if (r.grade) return <div className="rep"><b>Applied grade</b><KV o={r.grade} />{r.measured && <><b>Measured from your footage</b><KV o={r.measured} /></>}</div>;
      const rest = Object.fromEntries(Object.entries(r).filter(([x]) => !["sequence_ids", "files", "kind", "highlights", "state", "graph", "outputs"].includes(x)));
      return Object.keys(rest).length ? <KV o={rest} /> : null;
    }
  }
}

function fmt(v: any): ReactNode {
  if (typeof v === "number") return Number.isInteger(v) ? v : v.toFixed(3);
  if (Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === "number")) return <span className="rgb">{v.map((x, i) => <span key={i}>{fmt(x)}</span>)}</span>;
  if (Array.isArray(v)) return `${v.length} items`;
  if (v && typeof v === "object") return `${Object.keys(v).length} values`;
  return String(v);
}
function KV({ o }: { o: Record<string, any> }) {
  return <div className="kv">{Object.entries(o).map(([k, v]) => <div key={k}><span>{k.replace(/_/g, " ")}</span><b>{fmt(v)}</b></div>)}</div>;
}

function Kpi({ l, v }: { l: string; v: ReactNode }) { return <div className="kpi"><span>{l}</span><b>{v}</b></div>; }

function LoudMeter({ v }: { v: number | null }) {
  const pos = v == null ? 0 : Math.max(0, Math.min(100, ((v + 36) / 30) * 100));
  return <div className="loud" aria-label="Loudness meter"><div className="loud-zone" style={{ left: `${((-16 + 36) / 30) * 100}%`, width: `${(4 / 30) * 100}%` }}>YouTube target</div>
    <i style={{ left: `${pos}%` }} /><span>-36</span><span>-6 LUFS</span></div>;
}

function YtRows({ rows }: { rows: any[] }) {
  const max = Math.max(1, ...rows.map((r) => r.views || r.avg_recent_views || 0));
  return <div className="yt-rows">{rows.map((r, i) => { const v = r.views ?? r.avg_recent_views ?? 0; return (
    <div key={i} className="yt-row"><span className="yt-title">{r.title}{r.channel && <small> · {r.channel}</small>}{r.subscribers != null && <small> · {r.subscribers.toLocaleString()} subs · {r.uploads_last_15} recent</small>}</span>
      <span className="yt-bar"><i style={{ width: `${(v / max) * 100}%` }} /></span><b>{v.toLocaleString()}</b></div>); })}</div>;
}

function OppMap({ topics }: { topics: any[] }) {
  return <svg viewBox="0 0 300 200" className="opp-map" role="img" aria-label="Topics by demand and competition">
    <rect x="150" y="0" width="150" height="100" className="opp-best" /><text x="292" y="14" textAnchor="end" className="opp-q">high demand · low competition</text>
    <line x1="20" y1="180" x2="300" y2="180" className="opp-ax" /><line x1="20" y1="0" x2="20" y2="180" className="opp-ax" />
    <text x="160" y="196" textAnchor="middle" className="opp-l">less competition →</text><text x="12" y="90" className="opp-l" transform="rotate(-90 12 90)" textAnchor="middle">demand →</text>
    {topics.map((t, i) => { const x = 20 + (10 - t.competition) * 28, y = 180 - t.demand * 18; return <g key={i}><circle cx={x} cy={y} r="5" /><text x={x + 7} y={y + 4} className="opp-t">{String(t.topic).slice(0, 22)}</text></g>; })}
  </svg>;
}

export function TranscriptView({ segs, seek, srt, lang, now = -1 }: { segs: any[]; seek?: (t: number) => void; srt?: string; lang?: string; now?: number }) {
  const [q, setQ] = useState("");
  const list = segs.filter((s) => !q || s.text.toLowerCase().includes(q.toLowerCase()));
  return <div className="rep transcript">
    <div className="row"><input className="input sm" placeholder="Search transcript" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search transcript" />
      {srt && <button type="button" className="btn sm" onClick={() => saveText(`transcript-${lang ?? ""}.srt`, srt)}><Download size={13} />.srt</button>}
      <Copyable text={segs.map((s) => s.text).join(" ")}>Copy text</Copyable></div>
    <div className="tr-lines">{list.map((s, i) => <button type="button" key={i} className={`tr-line ${now >= s.start && now < s.end ? "now" : ""}`} onClick={() => seek?.(s.start)}>
      <span>{mmss(s.start)}</span><p>{s.text}</p></button>)}</div></div>;
}

function SubtitleTracks({ r, seek }: { r: any; seek?: (t: number) => void }) {
  const langs = Object.keys(r.translations || {});
  const [cur, setCur] = useState<string>(langs[0] ?? "source");
  const segs = cur === "source" ? r.source?.segments ?? [] : r.translations[cur]?.segments ?? [];
  const [edit, setEdit] = useState<any[]>(segs);
  useEffect(() => setEdit(segs), [cur, r]); // eslint-disable-line react-hooks/exhaustive-deps
  const srtOf = (ss: any[]) => ss.map((s, i) => `${i + 1}\n${ts(s.start)} --> ${ts(s.end)}\n${s.text}\n`).join("\n");
  return <div className="rep subs">
    <div className="sub-tabs">{r.source?.segments?.length ? <button type="button" className={cur === "source" ? "on" : ""} onClick={() => setCur("source")}>Original {r.source.language ? `(${r.source.language})` : ""}</button> : null}
      {langs.map((l) => <button type="button" key={l} className={cur === l ? "on" : ""} onClick={() => setCur(l)}>{l.toUpperCase()}<small>{r.translations[l].engine}</small></button>)}</div>
    <div className="sub-edit">{edit.map((s, i) => <div key={i} className="sub-row"><button type="button" onClick={() => seek?.(s.start)}>{mmss(s.start)}</button>
      <input className="input sm" value={s.text} onChange={(e) => setEdit(edit.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} aria-label={`Subtitle ${i + 1}`} /></div>)}</div>
    <button type="button" className="btn sm" onClick={() => saveText(`subtitles-${cur}.srt`, srtOf(edit))}><Download size={13} />Download {cur.toUpperCase()} .srt</button>
    {r.srt && !langs.length && <button type="button" className="btn sm" onClick={() => saveText("subtitles.srt", r.srt)}><Download size={13} />Download .srt</button>}
  </div>;
}
const ts = (x: number) => { const ms = Math.round(x * 1000); return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`; };

function DocActions({ g }: { g: Generation }) {
  const md = toMarkdown(g.result);
  return <div className="row" style={{ marginTop: 10 }}><Copyable text={md}>Copy as text</Copyable><button type="button" className="btn sm ghost" onClick={() => saveText(`${g.tool_name}.md`, md, "text/markdown")}><Download size={13} />.md</button></div>;
}
function toMarkdown(r: any): string {
  if (!r) return "";
  if (r.scenes) return `# ${r.title}\n\n${r.logline ?? ""}\n\n` + r.scenes.map((s: any, i: number) => `## ${i + 1}. ${s.heading}\n${s.narration}\n\n*Visuals:* ${s.visuals}`).join("\n\n") + (r.cta ? `\n\n**CTA:** ${r.cta}` : "");
  if (r.items) return r.items.map((x: any, i: number) => `${i + 1}. ${x.text}`).join("\n");
  if (r.beats) return `# ${r.title}\n\n` + r.beats.map((b: any, i: number) => `${i + 1}. **${b.name}** — ${b.summary}`).join("\n");
  if (r.lines) return `# ${r.title}\n\n` + r.lines.map((l: any) => `**${l.character}:** ${l.line}`).join("\n");
  if (r.weeks) return r.weeks.map((w: any) => `## Week ${w.week}\n` + w.items.map((x: any) => `- ${x.day}: ${x.title}`).join("\n")).join("\n\n");
  if (r.shots) return r.shots.map((s: any, i: number) => `${i + 1}. ${s.prompt} (${s.camera_move}, ${s.duration}s)`).join("\n");
  return JSON.stringify(r, null, 2);
}

function Files({ g }: { g: Generation }) {
  return <div className="rep model3d"><Box size={42} />
    <p>3D results open in Blender, Unity, Unreal or any glTF viewer.</p>
    {g.files.map((f) => <button key={f.key} type="button" className="btn primary" onClick={() => download(f.url, f.name)}><Download size={14} />Download {f.name}</button>)}
    <a className="btn ghost" href="https://gltf-viewer.donmccurdy.com/" target="_blank" rel="noreferrer"><ExternalLink size={13} />Open a glTF viewer</a></div>;
}

export function ErrorBox({ g }: { g: Generation }) {
  if (g.status !== "failed" && g.status !== "canceled") return null;
  return <div className="error-box" role="alert"><AlertTriangle size={15} /> {g.status === "canceled" ? "Cancelled." : g.error}</div>;
}
