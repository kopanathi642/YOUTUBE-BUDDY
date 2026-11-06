import { useEffect, useState } from "react";
import { X, Captions, Mic, Download, Wand2 } from "lucide-react";
import { api, Asset, Job } from "../api";
import { Timeline, Clip, Track, addTrack, end, sp, uid, DEFAULT_TRANSFORM } from "../timeline";

export type Voice = { id: string; label: string; language: string; style: string; first_use_download: string };
export type VoiceCatalog = { voices: Voice[]; languages: Record<string, string> };
export type Seg = { start: number; end: number; text: string };

/** Poll a job until it finishes. */
export async function waitJob(id: string, onProgress?: (j: Job) => void): Promise<Job> {
  for (;;) {
    const j = await api<Job>(`/jobs/${id}`);
    onProgress?.(j);
    if (["succeeded", "failed", "canceled"].includes(j.status)) return j;
    await new Promise((r) => setTimeout(r, 1500));
  }
}

/** Map source-time segments of one clip onto the timeline (respects trims and speed). */
export function segmentsOnTimeline(tl: Timeline, c: Clip, segs: Seg[]): { from: number; to: number; text: string }[] {
  const fps = tl.fps, s = sp(c), out: { from: number; to: number; text: string }[] = [];
  for (const g of segs) {
    const a = Math.max(g.start * fps, c.in), b = Math.min(g.end * fps, c.out);
    if (b - a < 2) continue;
    out.push({ from: c.start + Math.round((a - c.in) / s), to: Math.min(end(c), c.start + Math.round((b - c.in) / s)), text: g.text.trim() });
  }
  return out;
}

/** Put caption title clips on a "Captions" track (created if needed). Existing captions in that range are replaced. */
export function addCaptions(tl: Timeline, lines: { from: number; to: number; text: string }[]): Timeline {
  let t = tl;
  let track = t.tracks.find((x) => x.kind === "video" && x.name === "Captions");
  if (!track) {
    t = addTrack(t, "video");
    const id = t.tracks[0].id;
    t = { ...t, tracks: t.tracks.map((x) => (x.id === id ? { ...x, name: "Captions" } : x)) };
    track = t.tracks[0];
  }
  const lo = Math.min(...lines.map((l) => l.from)), hi = Math.max(...lines.map((l) => l.to));
  const keep = track.clips.filter((c) => end(c) <= lo || c.start >= hi);
  const sorted = [...lines].sort((a, b) => a.from - b.from);
  const fs = Math.round(Math.min(t.width, t.height) * 0.052);
  const clips: Clip[] = [];
  sorted.forEach((l, i) => {
    const to = Math.min(l.to, sorted[i + 1]?.from ?? l.to);
    if (to - l.from < 2 || keep.some((k) => l.from < end(k) && to > k.start)) return;
    clips.push({ id: uid("cap"), asset_id: null, start: l.from, in: 0, out: to - l.from, volume: 1, fade_in: 0, fade_out: 0,
      transform: { ...DEFAULT_TRANSFORM, y: Math.round(t.height * 0.36) },
      title: { text: l.text.length > 90 ? l.text.slice(0, 88) + "…" : l.text, font_size: fs, color: "#ffffff", bg_color: "#000000", bg_opacity: 0.6 } });
  });
  const tid = track.id;
  return { ...t, tracks: t.tracks.map((x: Track) => (x.id === tid ? { ...x, clips: [...keep, ...clips] } : x)) };
}

export function toSrt(lines: { from: number; to: number; text: string }[], fps: number): string {
  const tc = (f: number) => { const ms = Math.round((f / fps) * 1000); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`; };
  return lines.map((l, i) => `${i + 1}\n${tc(l.from)} --> ${tc(l.to)}\n${l.text}\n`).join("\n");
}

function download(name: string, text: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Captions / transcript / subtitle translation for the clips with sound on the timeline. */
export function CaptionsModal({ tl, assets, catalog, mode, onClose, onApply, refresh }: {
  tl: Timeline; assets: Map<string | null, Asset>; catalog: VoiceCatalog | null; mode: "captions" | "transcript";
  onClose: () => void; onApply: (t: Timeline) => void; refresh: () => Promise<void>;
}) {
  const clips = tl.tracks.filter((t) => !t.locked && t.name !== "Captions").flatMap((t) => t.clips).filter((c) => assets.get(c.asset_id)?.has_audio);
  const [lang, setLang] = useState(""); // "" = original language
  const [spoken, setSpoken] = useState(""); // "" = auto-detect
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [lines, setLines] = useState<{ from: number; to: number; text: string }[] | null>(null);

  async function run() {
    setErr(null); setLines(null);
    try {
      const ids = [...new Set(clips.map((c) => c.asset_id!))];
      for (const [i, id] of ids.entries()) {
        const a = assets.get(id)!;
        const has = lang ? a.analysis?.translations?.[lang] : a.analysis?.transcript;
        if (has) continue;
        setBusy(`${lang ? "Translating" : "Transcribing"} ${a.filename} (${i + 1}/${ids.length})…`);
        const j = await api<Job>(`/media/${id}/${lang ? "translate" : "transcribe"}`, { method: "POST", body: lang ? { target: lang } : { language: spoken || null } });
        const done = await waitJob(j.id, (x) => setBusy(`${x.stage ?? "Queued"} — ${a.filename} (${Math.round(x.progress * 100)}%)`));
        if (done.status !== "succeeded") throw new Error(done.error ?? "failed");
      }
      await refresh();
      const fresh = await api<Asset[]>(`/projects/${assets.values().next().value?.project_id}/media`);
      const by = new Map(fresh.map((a) => [a.id, a]));
      const out = clips.flatMap((c) => { const an = by.get(c.asset_id!)?.analysis; const segs = lang ? an?.translations?.[lang]?.segments : an?.transcript?.segments; return segs ? segmentsOnTimeline(tl, c, segs) : []; });
      if (!out.length) throw new Error("No speech was found in the clips on the timeline");
      setLines(out.sort((a, b) => a.from - b.from));
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(null); }
  }

  const langs = Object.entries(catalog?.languages ?? {});
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="card modal" role="dialog" aria-modal="true" aria-label="Captions" style={{ width: "min(560px,100%)" }}>
        <div className="row"><Captions size={18} color="#c084fc" /><b className="grow" style={{ fontSize: 17 }}>{mode === "captions" ? "Subtitles & translate" : "AI transcribe"}</b>
          <button className="btn icon ghost" aria-label="Close" onClick={onClose} disabled={!!busy}><X size={16} /></button></div>
        {clips.length === 0 ? <div className="empty">Add a clip with speech to the timeline first.</div> : <>
          <p className="muted" style={{ fontSize: 13 }}>Listens to the {clips.length} clip{clips.length > 1 ? "s" : ""} with sound on your timeline on the cloud worker.</p>
          <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label><span className="label">Spoken language</span><select className="select" value={spoken} onChange={(e) => setSpoken(e.target.value)} disabled={!!busy}>
              <option value="">Auto-detect</option>{langs.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label><span className="label">Captions in</span><select className="select" value={lang} onChange={(e) => setLang(e.target.value)} disabled={!!busy}>
              <option value="">Original language</option>{langs.map(([k, v]) => <option key={k} value={k}>{v} (translate)</option>)}</select></label>
          </div>
          {busy && <div className="row" style={{ marginTop: 12, fontSize: 13 }}><span className="spinner" />{busy}</div>}
          {err && <div className="error-box" style={{ marginTop: 12 }}>{err}</div>}
          {lines && <div className="transcript">{lines.map((l, i) => <div key={i}><span className="mono dim">{(l.from / tl.fps).toFixed(1)}s</span> {l.text}</div>)}</div>}
          <div className="row" style={{ justifyContent: "flex-end", marginTop: 14, flexWrap: "wrap" }}>
            {!lines && <button className="btn primary" onClick={run} disabled={!!busy}><Wand2 size={15} />{lang ? "Transcribe & translate" : "Transcribe"}</button>}
            {lines && <button className="btn" onClick={() => download(`captions${lang ? "-" + lang : ""}.srt`, toSrt(lines, tl.fps))}><Download size={14} />Download .srt</button>}
            {lines && <button className="btn primary" onClick={() => onApply(addCaptions(tl, lines))}><Captions size={15} />Add as captions</button>}
          </div>
        </>}
      </div>
    </div>
  );
}

export function TTSModal({ catalog, projectId, onClose, onCreated }: { catalog: VoiceCatalog | null; projectId: string; onClose: () => void; onCreated: (a: Asset) => void }) {
  const [text, setText] = useState("");
  const [lang, setLang] = useState("en");
  const voices = (catalog?.voices ?? []).filter((v) => v.language === lang);
  const [voice, setVoice] = useState("");
  const [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null);
  useEffect(() => { setVoice(voices[0]?.id ?? ""); }, [lang, catalog]); // eslint-disable-line react-hooks/exhaustive-deps
  const langs = [...new Set((catalog?.voices ?? []).map((v) => v.language))];
  async function go() {
    setBusy(true); setErr(null);
    try { onCreated(await api<Asset>(`/projects/${projectId}/ai/tts`, { method: "POST", body: { text, voice_id: voice } })); }
    catch (e) { setErr((e as Error).message); setBusy(false); }
  }
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="card modal" role="dialog" aria-modal="true" aria-label="Text to speech" style={{ width: "min(520px,100%)" }}>
        <div className="row"><Mic size={18} color="#c084fc" /><b className="grow" style={{ fontSize: 17 }}>Text to speech</b><button className="btn icon ghost" aria-label="Close" onClick={onClose}><X size={16} /></button></div>
        <label className="label" htmlFor="tts-text" style={{ marginTop: 12 }}>Script</label>
        <textarea id="tts-text" className="notes" style={{ width: "100%", minHeight: 110 }} value={text} onChange={(e) => setText(e.target.value)} maxLength={3000} placeholder="Type what the voice should say…" />
        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
          <label><span className="label">Language</span><select className="select" value={lang} onChange={(e) => setLang(e.target.value)}>{langs.map((l) => <option key={l} value={l}>{catalog?.languages[l] ?? l}</option>)}</select></label>
          <label><span className="label">Voice</span><select className="select" value={voice} onChange={(e) => setVoice(e.target.value)}>{voices.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}</select></label>
        </div>
        <div className="dim" style={{ fontSize: 11.5, marginTop: 8 }}>Free open-source Piper voices, generated on the cloud worker. The audio is added to your media bin and to the Voice track at the playhead.</div>
        {err && <div className="error-box" style={{ marginTop: 10 }}>{err}</div>}
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 14 }}>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={go} disabled={busy || !text.trim() || !voice}>{busy ? <span className="spinner" /> : <Mic size={15} />}Generate voice</button>
        </div>
      </div>
    </div>
  );
}
