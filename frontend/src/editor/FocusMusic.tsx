import { useCallback, useEffect, useRef, useState } from "react";
import { Music, Pause, Play, Volume2, SkipForward } from "lucide-react";
import type { Asset } from "../api";

/* Focus Music: background music while you edit.
 * - Built-in stations are generated live in the browser (Web Audio), so there are no licences to worry about.
 * - Or play any audio file from this project's media bin.
 * - Auto-pause: when the editor (or any preview) starts making sound, the music pauses by itself and comes back
 *   when that sound stops. Pausing it yourself always wins. */

type StationId = "lofi" | "ambient" | "rain" | "brown";
const STATIONS: { id: StationId; label: string; hint: string }[] = [
  { id: "lofi", label: "Lo-fi beats", hint: "Soft drums, warm chords, vinyl crackle" },
  { id: "ambient", label: "Calm ambient", hint: "Slow evolving pads" },
  { id: "rain", label: "Rain", hint: "Gentle rain to block out noise" },
  { id: "brown", label: "Focus noise", hint: "Deep brown noise" },
];
type Source = { kind: "station"; id: StationId } | { kind: "file"; id: string };
type Prefs = { source: Source; volume: number; autoPause: boolean };
const KEY = "cu.focusmusic.v1";
const loadPrefs = (): Prefs => {
  try { const p = JSON.parse(localStorage.getItem(KEY) || "null"); if (p?.source) return p; } catch { /* storage blocked */ }
  return { source: { kind: "station", id: "lofi" }, volume: 0.45, autoPause: true };
};

/* ---------------------------------------------------------------- generative stations */
type Engine = { stop: () => void };
function noiseBuffer(ctx: AudioContext, brown: boolean) {
  const len = ctx.sampleRate * 4, b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w; }
  return b;
}
function loopNoise(ctx: AudioContext, out: AudioNode, brown: boolean, gain: number, filter?: { type: BiquadFilterType; f: number; q?: number }) {
  const src = ctx.createBufferSource(); src.buffer = noiseBuffer(ctx, brown); src.loop = true;
  const g = ctx.createGain(); g.gain.value = gain;
  let node: AudioNode = src;
  if (filter) { const bq = ctx.createBiquadFilter(); bq.type = filter.type; bq.frequency.value = filter.f; bq.Q.value = filter.q ?? 0.7; src.connect(bq); node = bq; }
  node.connect(g); g.connect(out); src.start();
  return () => { try { src.stop(); } catch { /* already stopped */ } };
}
const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

function startStation(ctx: AudioContext, out: AudioNode, id: StationId): Engine {
  const stops: (() => void)[] = [];
  const timers: number[] = [];
  const pad = (notes: number[], at: number, dur: number, vol: number, cutoff: number) => {
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = cutoff; lp.connect(out);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(vol, at + dur * 0.3); g.gain.linearRampToValueAtTime(0, at + dur); g.connect(lp);
    for (const n of notes) for (const det of [-6, 6]) {
      const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = hz(n); o.detune.value = det; o.connect(g); o.start(at); o.stop(at + dur + 0.05);
    }
  };
  if (id === "brown") stops.push(loopNoise(ctx, out, true, 0.9, { type: "lowpass", f: 900 }));
  if (id === "rain") {
    stops.push(loopNoise(ctx, out, false, 0.22, { type: "bandpass", f: 1400, q: 0.4 }));
    stops.push(loopNoise(ctx, out, true, 0.5, { type: "lowpass", f: 500 }));
    const drop = () => {
      const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(1800 + Math.random() * 2500, t); o.frequency.exponentialRampToValueAtTime(400, t + 0.05);
      g.gain.setValueAtTime(0.03 + Math.random() * 0.04, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.07);
      timers.push(window.setTimeout(drop, 40 + Math.random() * 220));
    };
    drop();
  }
  if (id === "ambient") {
    const chords = [[48, 55, 62, 67], [45, 52, 60, 64], [41, 48, 57, 64], [43, 50, 59, 62]];
    let i = 0;
    const next = () => { pad(chords[i++ % chords.length], ctx.currentTime + 0.05, 9, 0.05, 1200); timers.push(window.setTimeout(next, 7000)); };
    next();
    stops.push(loopNoise(ctx, out, true, 0.08, { type: "lowpass", f: 400 }));
  }
  if (id === "lofi") {
    const bpm = 74, beat = 60 / bpm;
    const chords = [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [55, 59, 62, 65]];   // Fmaj7 Em7 Dm7 G7
    stops.push(loopNoise(ctx, out, false, 0.012, { type: "highpass", f: 3000 }));               // vinyl hiss
    let bar = 0, nextAt = ctx.currentTime + 0.1;
    const kick = (t: number) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.15);
      g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3); o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.32); };
    const hat = (t: number, v: number) => { const s = ctx.createBufferSource(); s.buffer = noiseBuffer(ctx, false); const f = ctx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 7000;
      const g = ctx.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05); s.connect(f); f.connect(g); g.connect(out); s.start(t); s.stop(t + 0.06); };
    const snare = (t: number) => { const s = ctx.createBufferSource(); s.buffer = noiseBuffer(ctx, false); const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 1800;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18); s.connect(f); f.connect(g); g.connect(out); s.start(t); s.stop(t + 0.2); };
    const schedule = () => {
      while (nextAt < ctx.currentTime + 1.5) {
        const t = nextAt, ch = chords[bar % chords.length];
        pad(ch, t, beat * 4, 0.035, 900);
        for (let b = 0; b < 4; b++) {
          const bt = t + b * beat;
          if (b === 0 || (b === 2 && bar % 2 === 1)) kick(bt);
          if (b === 1 || b === 3) snare(bt + 0.02);
          hat(bt + beat / 2 + 0.03, 0.04); hat(bt, 0.025);
        }
        bar++; nextAt += beat * 4;
      }
      timers.push(window.setTimeout(schedule, 400));
    };
    schedule();
  }
  return { stop: () => { timers.forEach(clearTimeout); stops.forEach((s) => s()); } };
}

/* ---------------------------------------------------------------- component */
export default function FocusMusic({ assets, editorPlaying }: { assets: Asset[]; editorPlaying: boolean }) {
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [open, setOpen] = useState(false);
  const [on, setOn] = useState(false);              // user wants music
  const [ducked, setDucked] = useState(false);      // paused because the editor is making sound
  const [otherMedia, setOtherMedia] = useState(0);  // other <video>/<audio> elements playing with sound
  const ctxRef = useRef<AudioContext | null>(null), gainRef = useRef<GainNode | null>(null), engRef = useRef<Engine | null>(null);
  const fileRef = useRef<HTMLAudioElement>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* ignore */ } }, [prefs]);
  const tracks = assets.filter((a) => a.kind === "audio" && a.status === "ready" && a.proxy_url);

  // watch every other media element on the page (timeline playback, previews, generator outputs)
  useEffect(() => {
    const playingEls = new Set<HTMLMediaElement>();
    const upd = () => setOtherMedia(playingEls.size);
    const isOurs = (el: HTMLMediaElement) => el === fileRef.current;
    const on = (e: Event) => { const el = e.target as HTMLMediaElement; if (!(el instanceof HTMLMediaElement) || isOurs(el)) return;
      if (e.type === "playing" && !el.muted && el.volume > 0) playingEls.add(el); else playingEls.delete(el); upd(); };
    for (const t of ["playing", "pause", "ended", "emptied", "volumechange"]) document.addEventListener(t, on, true);
    return () => { for (const t of ["playing", "pause", "ended", "emptied", "volumechange"]) document.removeEventListener(t, on, true); };
  }, []);
  const editorSound = editorPlaying || otherMedia > 0;
  // auto-pause / auto-resume (with a short grace so scrubbing doesn't flutter the music)
  useEffect(() => {
    if (!prefs.autoPause) { setDucked(false); return; }
    if (editorSound) { setDucked(true); return; }
    const t = window.setTimeout(() => setDucked(false), 900);
    return () => clearTimeout(t);
  }, [editorSound, prefs.autoPause]);

  const audible = on && !ducked;
  const ensureCtx = () => {
    if (!ctxRef.current) {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const g = ctx.createGain(); g.gain.value = 0; g.connect(ctx.destination);
      ctxRef.current = ctx; gainRef.current = g;
    }
    return ctxRef.current!;
  };
  // start/stop the chosen source
  useEffect(() => {
    engRef.current?.stop(); engRef.current = null;
    const a = fileRef.current;
    if (!on) { a?.pause(); return; }
    if (prefs.source.kind === "station") {
      a?.pause();
      const ctx = ensureCtx(); void ctx.resume();
      engRef.current = startStation(ctx, gainRef.current!, prefs.source.id);
    } else if (a) {
      const t = tracks.find((x) => x.id === prefs.source.id);
      if (t && a.dataset.id !== t.id) { a.src = t.proxy_url!; a.dataset.id = t.id; }
    }
    return () => { engRef.current?.stop(); engRef.current = null; };
  }, [on, prefs.source.kind, prefs.source.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // volume + ducking with smooth fades
  useEffect(() => {
    const v = audible ? prefs.volume : 0;
    const ctx = ctxRef.current, g = gainRef.current;
    if (ctx && g) { g.gain.cancelScheduledValues(ctx.currentTime); g.gain.setTargetAtTime(v * 0.6, ctx.currentTime, 0.25); }
    const a = fileRef.current;
    if (a && prefs.source.kind === "file") {
      a.volume = Math.min(1, prefs.volume);
      if (audible) void a.play().catch(() => setOn(false)); else a.pause();
    }
  }, [audible, prefs.volume, prefs.source.kind]);
  useEffect(() => () => { engRef.current?.stop(); void ctxRef.current?.close(); }, []);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const pick = useCallback((s: Source) => { setPrefs((p) => ({ ...p, source: s })); setOn(true); }, []);
  const cur = prefs.source.kind === "station" ? STATIONS.find((s) => s.id === prefs.source.id)?.label : tracks.find((t) => t.id === prefs.source.id)?.filename ?? "Your track";
  const nextStation = () => { const i = STATIONS.findIndex((s) => prefs.source.kind === "station" && s.id === prefs.source.id); pick({ kind: "station", id: STATIONS[(i + 1) % STATIONS.length].id }); };

  return (
    <div className="fm" ref={box}>
      <audio ref={fileRef} loop preload="none" data-focus-music="1" />
      <button className={`btn sm ghost fm-btn ${on ? "on" : ""}`} onClick={() => setOpen(!open)} aria-haspopup="dialog" aria-expanded={open}
        title={on ? (ducked ? "Focus music paused while the editor plays sound" : `Playing: ${cur}`) : "Focus music"} aria-label="Focus music">
        <Music size={15} />{on && <span className={`fm-eq ${ducked ? "paused" : ""}`} aria-hidden><i /><i /><i /></span>}
      </button>
      {open && <div className="menu fm-pop" role="dialog" aria-label="Focus music">
        <div className="fm-head">
          <button className="fm-play" onClick={() => { if (!on) ensureCtx(); setOn(!on); }} aria-label={on ? "Pause music" : "Play music"}>{on ? <Pause size={18} /> : <Play size={18} />}</button>
          <div className="grow" style={{ minWidth: 0 }}><b className="ellipsis" style={{ display: "block" }}>{cur}</b>
            <span className="dim" style={{ fontSize: 11 }}>{!on ? "Paused" : ducked ? "Waiting — the editor is playing sound" : "Playing"}</span></div>
          {prefs.source.kind === "station" && <button className="ws-icon" onClick={nextStation} title="Next station" aria-label="Next station"><SkipForward size={15} /></button>}
        </div>
        <label className="fm-vol"><Volume2 size={14} /><input type="range" min={0} max={1} step={0.01} value={prefs.volume} aria-label="Music volume"
          onChange={(e) => setPrefs((p) => ({ ...p, volume: +e.target.value }))} /></label>
        <label className="fm-auto"><input type="checkbox" checked={prefs.autoPause} onChange={(e) => setPrefs((p) => ({ ...p, autoPause: e.target.checked }))} />
          Auto-pause when the editor plays sound, resume when it stops</label>
        <div className="menu-label">Stations</div>
        {STATIONS.map((s) => <button key={s.id} className={`menu-item ${prefs.source.kind === "station" && prefs.source.id === s.id ? "on" : ""}`} onClick={() => pick({ kind: "station", id: s.id })}>
          <span className="grow">{s.label}<small className="dim" style={{ display: "block", fontSize: 11 }}>{s.hint}</small></span></button>)}
        <div className="menu-label">From your media</div>
        {tracks.length === 0 ? <div className="dim" style={{ fontSize: 11.5, padding: "2px 10px 8px" }}>Import an audio file to play your own music here.</div>
          : tracks.slice(0, 8).map((t) => <button key={t.id} className={`menu-item ${prefs.source.kind === "file" && prefs.source.id === t.id ? "on" : ""}`} onClick={() => pick({ kind: "file", id: t.id })}>
            <span className="grow ellipsis">{t.filename}</span></button>)}
        <div className="dim" style={{ fontSize: 10.5, padding: "8px 10px 2px", borderTop: "1px solid var(--line)" }}>Only you hear this. It is never added to your video.</div>
      </div>}
    </div>
  );
}
