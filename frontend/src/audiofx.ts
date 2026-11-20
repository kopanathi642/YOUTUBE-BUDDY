// Fairlight-style audio effects. Same parameters as backend/app/effects.py (audio_filters):
// RBJ biquads (Web Audio BiquadFilterNode == FFmpeg bass/equalizer/treble/highpass/lowpass/bandreject, verified in
// backend/tests/test_audio_fx.py), the same echo/reverb delay taps, the same tanh curve and stereo-width matrix.
// Compressor / limiter / tremolo use Web Audio's own nodes (close, not sample-identical); de-esser, pitch and
// leveler run in the export only and the editor says so.

export type AudioFxType = "eqlow" | "eqmid" | "eqhigh" | "highpass" | "lowpass" | "dehum" | "echo" | "reverb" | "compressor" | "limiter"
  | "distortion" | "tremolo" | "width" | "deesser" | "pitch" | "leveler";
export type AudioFx = { type: AudioFxType; amount: number };
export type AudioGroup = "EQ & Filters" | "Clean-up" | "Dynamics" | "Space" | "Character";

export const AUDIO_FX: { type: AudioFxType; label: string; group: AudioGroup; min: number; max: number; step: number; def: number; unit: string; hint: string; exportOnly?: boolean }[] = [
  { type: "eqlow", label: "Bass (low EQ)", group: "EQ & Filters", min: -12, max: 12, step: 0.5, def: 4, unit: " dB", hint: "Boost or cut below ~100 Hz" },
  { type: "eqmid", label: "Mid EQ", group: "EQ & Filters", min: -12, max: 12, step: 0.5, def: 3, unit: " dB", hint: "Boost or cut around 1 kHz (voice presence)" },
  { type: "eqhigh", label: "Treble (high EQ)", group: "EQ & Filters", min: -12, max: 12, step: 0.5, def: 3, unit: " dB", hint: "Boost or cut above ~8 kHz (air, crispness)" },
  { type: "highpass", label: "High-pass (rumble cut)", group: "EQ & Filters", min: 20, max: 2000, step: 10, def: 100, unit: " Hz", hint: "Removes fan, AC and wind rumble below this frequency" },
  { type: "lowpass", label: "Low-pass", group: "EQ & Filters", min: 300, max: 20000, step: 100, def: 8000, unit: " Hz", hint: "Removes hiss and harsh highs above this frequency" },
  { type: "dehum", label: "De-Hum (50 Hz)", group: "Clean-up", min: 1, max: 1, step: 1, def: 1, unit: "", hint: "Removes electrical hum (50 Hz mains and harmonics)" },
  { type: "deesser", label: "De-Esser", group: "Clean-up", min: 0.1, max: 1, step: 0.05, def: 0.5, unit: "", hint: "Tames harsh 's' sounds. Applied in the export.", exportOnly: true },
  { type: "compressor", label: "Compressor", group: "Dynamics", min: 0.1, max: 1, step: 0.05, def: 0.5, unit: "", hint: "Evens out loud and quiet parts (ratio 4:1)" },
  { type: "limiter", label: "Limiter", group: "Dynamics", min: -12, max: -1, step: 0.5, def: -1, unit: " dB", hint: "Stops peaks going above this level" },
  { type: "leveler", label: "Dialogue Leveler", group: "Dynamics", min: 1, max: 1, step: 1, def: 1, unit: "", hint: "Makes speech one steady level. Applied in the export.", exportOnly: true },
  { type: "echo", label: "Echo / Delay", group: "Space", min: 60, max: 1000, step: 10, def: 300, unit: " ms", hint: "One repeat after this delay" },
  { type: "reverb", label: "Reverb", group: "Space", min: 0.1, max: 1, step: 0.05, def: 0.4, unit: "", hint: "Room sound (more = bigger, wetter)" },
  { type: "width", label: "Stereo Width", group: "Space", min: 0, max: 2, step: 0.05, def: 1.4, unit: "×", hint: "0 = mono, 1 = unchanged, 2 = extra wide" },
  { type: "distortion", label: "Distortion", group: "Character", min: 1, max: 20, step: 0.5, def: 4, unit: "", hint: "Warm saturation to gritty overdrive" },
  { type: "tremolo", label: "Tremolo", group: "Character", min: 1, max: 15, step: 0.5, def: 6, unit: " Hz", hint: "Pulsing volume" },
  { type: "pitch", label: "Pitch", group: "Character", min: -12, max: 12, step: 1, def: 4, unit: " st", hint: "Higher or deeper voice, same speed. Applied in the export.", exportOnly: true },
];
export const AUDIO_GROUPS: AudioGroup[] = ["EQ & Filters", "Clean-up", "Dynamics", "Space", "Character"];
export const audioMeta = (t: AudioFxType) => AUDIO_FX.find((x) => x.type === t)!;
export const AUDIO_ORDER: AudioFxType[] = ["highpass", "lowpass", "dehum", "deesser", "eqlow", "eqmid", "eqhigh", "pitch", "distortion", "compressor", "leveler",
  "tremolo", "echo", "reverb", "width", "limiter"];
export const REVERB_TAPS_MS = [23, 37, 53, 71, 89, 113, 139, 167, 199, 233, 271, 311, 359, 409];
export const reverbGains = (a: number) => REVERB_TAPS_MS.map((d) => Math.round(a * 0.55 * Math.exp(-d / 160) * 1e4) / 1e4);
export const clampAudio = (e: AudioFx): AudioFx => { const m = audioMeta(e.type); return { type: e.type, amount: +Math.min(m.max, Math.max(m.min, Math.round(e.amount / m.step) * m.step)).toFixed(4) }; };
export const audioExportOnly = (fx: AudioFx[] | null | undefined) => (fx ?? []).filter((e) => audioMeta(e.type).exportOnly);

/** CapCut-style voice presets. */
export const VOICE_PRESETS: { name: string; fx: AudioFx[] }[] = [
  { name: "Clear Voice", fx: [{ type: "highpass", amount: 90 }, { type: "dehum", amount: 1 }, { type: "eqmid", amount: 2 }, { type: "eqhigh", amount: 2 }, { type: "compressor", amount: 0.5 }, { type: "limiter", amount: -1 }] },
  { name: "Podcast", fx: [{ type: "highpass", amount: 80 }, { type: "eqlow", amount: 2 }, { type: "compressor", amount: 0.7 }, { type: "deesser", amount: 0.4 }, { type: "limiter", amount: -1 }] },
  { name: "Telephone", fx: [{ type: "highpass", amount: 400 }, { type: "lowpass", amount: 3400 }, { type: "distortion", amount: 2 }] },
  { name: "Radio", fx: [{ type: "highpass", amount: 500 }, { type: "lowpass", amount: 5000 }, { type: "compressor", amount: 0.8 }] },
  { name: "Megaphone", fx: [{ type: "highpass", amount: 800 }, { type: "lowpass", amount: 3000 }, { type: "distortion", amount: 7 }] },
  { name: "Underwater", fx: [{ type: "lowpass", amount: 500 }, { type: "reverb", amount: 0.3 }] },
  { name: "Stadium", fx: [{ type: "reverb", amount: 0.8 }, { type: "echo", amount: 140 }] },
  { name: "Chipmunk", fx: [{ type: "pitch", amount: 7 }] },
  { name: "Deep Voice", fx: [{ type: "pitch", amount: -5 }, { type: "eqlow", amount: 3 }] },
];

// ---------- Web Audio preview graph
const BUTTERWORTH_Q_DB = -3.0103;   // Web Audio's lowpass/highpass Q is in dB; 0.7071 linear = −3.01 dB

function biquad(ctx: BaseAudioContext, type: BiquadFilterType, f: number, gain = 0, q?: number) {
  const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.gain.value = gain; if (q !== undefined) n.Q.value = q; return n;
}

/** Builds the effect chain; returns [input, output] nodes. */
export function buildAudioChain(ctx: BaseAudioContext, fx: AudioFx[]): [AudioNode, AudioNode] {
  const input = ctx.createGain();
  let cur: AudioNode = input;
  const then = (n: AudioNode) => { cur.connect(n); cur = n; };
  for (const e of [...fx].sort((a, b) => AUDIO_ORDER.indexOf(a.type) - AUDIO_ORDER.indexOf(b.type))) {
    const a = e.amount;
    switch (e.type) {
      case "eqlow": then(biquad(ctx, "lowshelf", 100, a)); break;
      case "eqmid": then(biquad(ctx, "peaking", 1000, a, 1)); break;
      case "eqhigh": then(biquad(ctx, "highshelf", 8000, a)); break;
      case "highpass": then(biquad(ctx, "highpass", a, 0, BUTTERWORTH_Q_DB)); break;
      case "lowpass": then(biquad(ctx, "lowpass", a, 0, BUTTERWORTH_Q_DB)); break;
      case "dehum": for (const f of [50, 100, 150]) then(biquad(ctx, "notch", f, 0, 10)); break;
      case "compressor": { const c = ctx.createDynamicsCompressor(); c.threshold.value = -10 - 20 * a; c.ratio.value = 4; c.knee.value = 6; c.attack.value = 0.005; c.release.value = 0.1; then(c); break; }
      case "limiter": { const c = ctx.createDynamicsCompressor(); c.threshold.value = a; c.ratio.value = 20; c.knee.value = 0; c.attack.value = 0.001; c.release.value = 0.05; then(c); break; }
      case "distortion": {
        const w = ctx.createWaveShaper(), N = 2048, curve = new Float32Array(N), t = Math.tanh(a);
        for (let i = 0; i < N; i++) { const x = (i / (N - 1)) * 2 - 1; curve[i] = Math.tanh(a * x) / t; }
        w.curve = curve; w.oversample = "2x"; then(w); break;
      }
      case "tremolo": {
        const g = ctx.createGain(); g.gain.value = 0.7;
        const lfo = ctx.createOscillator(); lfo.frequency.value = a; const depth = ctx.createGain(); depth.gain.value = 0.3;
        lfo.connect(depth).connect(g.gain); lfo.start(); then(g); break;
      }
      case "echo": case "reverb": {   // dry + the same delay taps FFmpeg's aecho uses
        const out = ctx.createGain(); cur.connect(out);
        const taps = e.type === "echo" ? [[a, 0.4]] : REVERB_TAPS_MS.map((d, i) => [d, reverbGains(a)[i]]);
        for (const [ms, g] of taps) { const d = ctx.createDelay(1.5); d.delayTime.value = ms / 1000; const gn = ctx.createGain(); gn.gain.value = g; cur.connect(d).connect(gn).connect(out); }
        cur = out; break;
      }
      case "width": {   // L' = (1+m)/2·L + (1−m)/2·R (FFmpeg extrastereo, c=false)
        const sp = ctx.createChannelSplitter(2), mg = ctx.createChannelMerger(2);
        const k1 = (1 + a) / 2, k2 = (1 - a) / 2;
        const g = (v: number) => { const n = ctx.createGain(); n.gain.value = v; return n; };
        cur.connect(sp);
        sp.connect(g(k1), 0).connect(mg, 0, 0); sp.connect(g(k2), 1).connect(mg, 0, 0);
        sp.connect(g(k1), 1).connect(mg, 0, 1); sp.connect(g(k2), 0).connect(mg, 0, 1);
        cur = mg; break;
      }
      default: break;   // export-only effects
    }
  }
  return [input, cur];
}

// One AudioContext for the editor; each media element is routed through its clip's chain once it has effects.
let ctx: AudioContext | null = null;
const routed = new WeakMap<HTMLMediaElement, { src: MediaElementAudioSourceNode; key: string; nodes: [AudioNode, AudioNode] | null }>();
export const audioCtx = () => (ctx ??= new AudioContext());
export function resumeAudio() { if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {}); }

/** Route a media element through `fx` (no-op when it has none and was never routed). */
export function routeElement(el: HTMLMediaElement, fx: AudioFx[] | null | undefined) {
  const list = (fx ?? []).filter((e) => !audioMeta(e.type).exportOnly);
  const key = JSON.stringify(list);
  let r = routed.get(el);
  if (!r) {
    if (!list.length) return;
    const c = audioCtx();
    r = { src: c.createMediaElementSource(el), key: "", nodes: null };
    routed.set(el, r);
  }
  if (r.key === key && r.nodes) return;
  const c = audioCtx();
  r.src.disconnect();
  r.nodes?.[1].disconnect();
  r.nodes = buildAudioChain(c, list);
  r.src.connect(r.nodes[0]);
  r.nodes[1].connect(c.destination);
  r.key = key;
}
