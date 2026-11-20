// Video effects, styles, animations and text styles (Resolve / Premiere / CapCut style).
// Preview == export: the colour maths here (W3C matrices, transfer functions, convolution kernel, vignette curve)
// is mirrored in backend/app/effects.py, which turns the same numbers into FFmpeg filters.
import type { Clip, ColorGrade, Timeline, Title } from "./timeline";
import type { Keyframes, Keyframe } from "./keyframes";

export type EffectType = "bw" | "sepia" | "hue" | "invert" | "posterize" | "sharpen" | "vignette" | "grain" | "rgbsplit" | "letterbox" | "flipv";
export type Effect = { type: EffectType; amount: number };

export const EFFECTS: { type: EffectType; label: string; group: "Colour" | "Stylize" | "Sharpen" | "Frame"; min: number; max: number; step: number; def: number; unit?: string; hint: string }[] = [
  { type: "bw", label: "Black & White", group: "Colour", min: 0, max: 1, step: 0.05, def: 1, hint: "Remove colour (strength 0–100%)" },
  { type: "sepia", label: "Sepia", group: "Colour", min: 0, max: 1, step: 0.05, def: 0.8, hint: "Warm old-photo tone" },
  { type: "hue", label: "Hue Shift", group: "Colour", min: -180, max: 180, step: 1, def: 60, unit: "°", hint: "Rotate every colour around the colour wheel" },
  { type: "invert", label: "Invert", group: "Colour", min: 0, max: 1, step: 0.05, def: 1, hint: "Photo-negative colours" },
  { type: "posterize", label: "Posterize", group: "Stylize", min: 2, max: 16, step: 1, def: 5, unit: " levels", hint: "Flat comic-book colour bands" },
  { type: "rgbsplit", label: "RGB Split", group: "Stylize", min: 1, max: 40, step: 1, def: 8, unit: " px", hint: "Glitch: red and blue shifted apart" },
  { type: "grain", label: "Film Grain", group: "Stylize", min: 0.05, max: 1, step: 0.05, def: 0.35, hint: "Moving film noise (random each frame)" },
  { type: "vignette", label: "Vignette", group: "Stylize", min: 0.05, max: 1, step: 0.05, def: 0.5, hint: "Darken the corners" },
  { type: "sharpen", label: "Sharpen", group: "Sharpen", min: 0.1, max: 2, step: 0.1, def: 0.6, hint: "Crisper edges" },
  { type: "letterbox", label: "Cinema Bars", group: "Frame", min: 0.02, max: 0.25, step: 0.01, def: 0.12, hint: "Black bars top and bottom (0.12 ≈ 2.35:1 on 16:9)" },
  { type: "flipv", label: "Flip Vertical", group: "Frame", min: 1, max: 1, step: 1, def: 1, hint: "Upside down" },
];
export const effectMeta = (t: EffectType) => EFFECTS.find((e) => e.type === t)!;
export const clampEffect = (e: Effect): Effect => { const m = effectMeta(e.type); return { type: e.type, amount: +Math.min(m.max, Math.max(m.min, Math.round(e.amount / m.step) * m.step)).toFixed(4) }; };
/** Effects in the order export applies them (the preview follows the same order). */
export const EFFECT_ORDER: EffectType[] = ["flipv", "bw", "sepia", "hue", "invert", "posterize", "sharpen", "rgbsplit", "vignette", "grain", "letterbox"];
export const sortEffects = (fx: Effect[]) => [...fx].sort((a, b) => EFFECT_ORDER.indexOf(a.type) - EFFECT_ORDER.indexOf(b.type));

// ---------- colour maths (W3C Filter Effects; same numbers in backend/app/effects.py)
type M3 = number[]; // row-major 3x3
const lerpI = (m: M3, a: number): M3 => m.map((v, i) => (i % 4 === 0 ? 1 : 0) * (1 - a) + v * a);
export const saturateM = (s: number): M3 => [
  0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s,
  0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s,
  0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s];
export const sepiaM = (a: number): M3 => lerpI([0.393, 0.769, 0.189, 0.349, 0.686, 0.168, 0.272, 0.534, 0.131], a);
export const hueM = (deg: number): M3 => {
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return [
    0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
    0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.140, 0.072 - c * 0.072 - s * 0.283,
    0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072];
};
/** Sharpen kernel (3x3, sums to 1). */
export const sharpenK = (a: number) => [0, -a, 0, -a, 1 + 4 * a, -a, 0, -a, 0];
/** Vignette darkening at normalised distance d (0 centre … 1 corner): FFmpeg's vignette curve, cos(angle·d)^4. */
export const vignetteFactor = (a: number, d: number) => { const c = Math.cos(a * (Math.PI / 2) * Math.min(1, d)); return c * c * c * c; };
/** sRGB picture gets these posterize levels: x → floor(x·n)/(n−1). */
export const posterTable = (n: number) => Array.from({ length: n }, (_, i) => +(i / (n - 1)).toFixed(4)).join(" ");

const m4 = (m: M3) => `${m.slice(0, 3).join(" ")} 0 0 ${m.slice(3, 6).join(" ")} 0 0 ${m.slice(6, 9).join(" ")} 0 0 0 0 0 1 0`;
const f = (v: number) => +v.toFixed(5);

/** SVG filter body for the colour/pixel effects of a clip. `k` = screen px per sequence px. Empty when none apply. */
export function svgEffectsBody(effects: Effect[] | null | undefined, k: number): string {
  const out: string[] = [];
  for (const e of sortEffects(effects ?? [])) {
    const a = e.amount;
    if (e.type === "bw") out.push(`<feColorMatrix type="matrix" values="${m4(saturateM(1 - a).map(f))}"/>`);
    if (e.type === "sepia") out.push(`<feColorMatrix type="matrix" values="${m4(sepiaM(a).map(f))}"/>`);
    if (e.type === "hue") out.push(`<feColorMatrix type="matrix" values="${m4(hueM(a).map(f))}"/>`);
    if (e.type === "invert") out.push(`<feComponentTransfer>${["R", "G", "B"].map((c) => `<feFunc${c} type="linear" slope="${f(1 - 2 * a)}" intercept="${f(a)}"/>`).join("")}</feComponentTransfer>`);
    if (e.type === "posterize") out.push(`<feComponentTransfer>${["R", "G", "B"].map((c) => `<feFunc${c} type="discrete" tableValues="${posterTable(Math.round(a))}"/>`).join("")}</feComponentTransfer>`);
    if (e.type === "sharpen") out.push(`<feConvolveMatrix order="3" kernelMatrix="${sharpenK(a).map(f).join(" ")}" divisor="1" edgeMode="duplicate" preserveAlpha="true"/>`);
    if (e.type === "rgbsplit") {
      const p = f(a * k);
      out.push(`<feColorMatrix result="src" type="identity"/>`,
        `<feColorMatrix in="src" type="matrix" values="1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0"/><feOffset dx="${-p}" result="r"/>`,
        `<feColorMatrix in="src" type="matrix" values="0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0" result="g"/>`,
        `<feColorMatrix in="src" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0"/><feOffset dx="${p}" result="b"/>`,
        `<feComposite in="r" in2="g" operator="arithmetic" k2="1" k3="1" result="rg"/>`,
        `<feComposite in="rg" in2="b" operator="arithmetic" k2="1" k3="1"/>`);
    }
  }
  return out.join("");
}

/** Overlays drawn on top of the picture (not filtered): vignette, grain, cinema bars. */
export function overlayEffects(effects: Effect[] | null | undefined) {
  const fx = effects ?? [];
  const v = fx.find((e) => e.type === "vignette"), g = fx.find((e) => e.type === "grain"), lb = fx.find((e) => e.type === "letterbox");
  const vignette = v ? `radial-gradient(circle farthest-corner at 50% 50%, ${Array.from({ length: 13 }, (_, i) => {
    const d = i / 12; return `rgba(0,0,0,${f(1 - vignetteFactor(v.amount, d))}) ${f(d * 100)}%`; }).join(", ")})` : null;
  return { vignette, grain: g ? g.amount : 0, bars: lb ? lb.amount : 0 };
}
export const flippedV = (effects: Effect[] | null | undefined) => !!effects?.some((e) => e.type === "flipv");

// ---------- styles (one-click looks = colour grade + effects)
export type Style = { name: string; effects: Effect[]; grade?: Partial<ColorGrade> };
export const STYLES: Style[] = [
  { name: "VHS", effects: [{ type: "rgbsplit", amount: 5 }, { type: "grain", amount: 0.45 }, { type: "sharpen", amount: 0.3 }], grade: { saturation: 1.25, contrast: 0.92, lift: [0.03, 0.02, 0.04] } },
  { name: "Old Film", effects: [{ type: "sepia", amount: 0.75 }, { type: "grain", amount: 0.55 }, { type: "vignette", amount: 0.6 }], grade: { contrast: 1.05 } },
  { name: "Noir", effects: [{ type: "bw", amount: 1 }, { type: "vignette", amount: 0.55 }], grade: { contrast: 1.35, gamma: [0.92, 0.92, 0.92] } },
  { name: "Cinematic", effects: [{ type: "letterbox", amount: 0.12 }, { type: "vignette", amount: 0.3 }], grade: { lift: [-0.03, 0.01, 0.05], gain: [1.12, 1.0, 0.86], saturation: 1.1, contrast: 1.08 } },
  { name: "Comic", effects: [{ type: "posterize", amount: 5 }, { type: "sharpen", amount: 1 }], grade: { saturation: 1.35, contrast: 1.15 } },
  { name: "Glitch", effects: [{ type: "rgbsplit", amount: 14 }, { type: "posterize", amount: 8 }], grade: { saturation: 1.3 } },
  { name: "Retro 80s", effects: [{ type: "hue", amount: -20 }, { type: "rgbsplit", amount: 3 }, { type: "grain", amount: 0.25 }], grade: { saturation: 1.2, gain: [1.1, 0.95, 1.08] } },
  { name: "Polaroid", effects: [{ type: "sepia", amount: 0.25 }, { type: "vignette", amount: 0.4 }], grade: { lift: [0.06, 0.05, 0.04], contrast: 0.9, saturation: 0.85 } },
  { name: "Dreamy", effects: [{ type: "vignette", amount: 0.25 }], grade: { lift: [0.05, 0.03, 0.06], gain: [1.05, 1.0, 1.04], contrast: 0.85, saturation: 1.1 } },
  { name: "Negative", effects: [{ type: "invert", amount: 1 }] },
];

// ---------- animations (CapCut In / Out / Combo), written as keyframes so preview and export use the same maths
export type AnimKind = "in" | "out" | "combo";
export const ANIMATIONS: { id: string; label: string; kind: AnimKind }[] = [
  { id: "zoomIn", label: "Zoom in", kind: "in" }, { id: "zoomOut", label: "Zoom out", kind: "in" }, { id: "slideL", label: "Slide from left", kind: "in" },
  { id: "slideR", label: "Slide from right", kind: "in" }, { id: "slideU", label: "Slide from top", kind: "in" }, { id: "slideD", label: "Slide from bottom", kind: "in" },
  { id: "spin", label: "Spin in", kind: "in" }, { id: "pop", label: "Pop", kind: "in" },
  { id: "zoomIn", label: "Zoom away", kind: "out" }, { id: "zoomOut", label: "Shrink", kind: "out" }, { id: "slideL", label: "Slide to left", kind: "out" },
  { id: "slideR", label: "Slide to right", kind: "out" }, { id: "slideU", label: "Slide up", kind: "out" }, { id: "slideD", label: "Slide down", kind: "out" },
  { id: "spin", label: "Spin out", kind: "out" }, { id: "pop", label: "Pop out", kind: "out" },
  { id: "scroll", label: "Scroll (credits)", kind: "combo" }, { id: "crawl", label: "Crawl (ticker)", kind: "combo" },
  { id: "shake", label: "Shake", kind: "combo" }, { id: "pulse", label: "Pulse", kind: "combo" }, { id: "kenburns", label: "Ken Burns", kind: "combo" },
];

type P = "x" | "y" | "scale" | "rotation" | "opacity";
const kf = (t: number, v: number, ease: Keyframe["ease"] = "ease"): Keyframe => ({ t: Math.max(0, Math.round(t)), v: +v.toFixed(4), ease });

/** Keyframes for an animation on a clip `len` frames long (frames-per-second `fps`, sequence size W×H).
 *  In/out animations last 0.5 s (or a third of the clip); combos run over the whole clip. Other properties are untouched. */
export function animationKeys(id: string, kind: AnimKind, c: Clip, len: number, fps: number, W: number, H: number): Partial<Record<P, Keyframe[]>> {
  const tf = c.transform, d = Math.max(2, Math.min(Math.round(fps * 0.5), Math.floor(len / 3)));
  const last = len - 1;
  // value "away" from the resting transform for each in/out kind
  const away: Record<string, Partial<Record<P, number>>> = {
    zoomIn: { scale: tf.scale * 1.35, opacity: 0 }, zoomOut: { scale: tf.scale * 0.6, opacity: 0 },
    slideL: { x: tf.x - W }, slideR: { x: tf.x + W }, slideU: { y: tf.y - H }, slideD: { y: tf.y + H },
    spin: { rotation: tf.rotation - 180, scale: tf.scale * 0.3, opacity: 0 }, pop: { scale: tf.scale * 0.2, opacity: 0 },
  };
  const rest: Record<P, number> = { x: tf.x, y: tf.y, scale: tf.scale, rotation: tf.rotation, opacity: tf.opacity };
  if (kind !== "combo") {
    const a = away[id]; if (!a) return {};
    const out: Partial<Record<P, Keyframe[]>> = {};
    for (const p of Object.keys(a) as P[]) {
      if (kind === "in") {
        out[p] = id === "pop" && p === "scale"
          ? [kf(0, a[p]!), kf(d * 0.7, rest.scale * 1.08), kf(d, rest.scale, "linear")]
          : [kf(0, a[p]!), kf(d, rest[p], "linear")];
      } else {
        out[p] = id === "pop" && p === "scale"
          ? [kf(last - d, rest.scale), kf(last - d * 0.3, rest.scale * 1.08), kf(last, a[p]!, "linear")]
          : [kf(last - d, rest[p]), kf(last, a[p]!, "linear")];
      }
    }
    return out;
  }
  if (id === "shake") {   // ±1.5% of the width, every 2 frames, at most 60 keyframes
    const amp = W * 0.015, n = Math.min(60, Math.floor(len / 2));
    const xs: Keyframe[] = [], ys: Keyframe[] = [];
    for (let i = 0; i <= n; i++) { const t = Math.min(last, Math.round((i * last) / n)); const s = i % 2 ? 1 : -1;
      xs.push(kf(t, tf.x + (i === 0 || i === n ? 0 : s * amp * (0.6 + 0.4 * ((i * 7) % 5) / 4)), "linear"));
      ys.push(kf(t, tf.y + (i === 0 || i === n ? 0 : -s * amp * 0.5 * (0.5 + ((i * 3) % 4) / 6)), "linear")); }
    return { x: dedupe(xs), y: dedupe(ys) };
  }
  if (id === "pulse") {   // a soft 5% beat every second
    const beats = Math.min(30, Math.max(1, Math.floor(len / fps)));
    const ks: Keyframe[] = [];
    for (let b = 0; b < beats; b++) { const t0 = Math.round((b * last) / beats), t1 = Math.round(((b + 0.5) * last) / beats); ks.push(kf(t0, tf.scale), kf(t1, tf.scale * 1.05)); }
    ks.push(kf(last, tf.scale, "linear"));
    return { scale: dedupe(ks) };
  }
  if (id === "scroll") return { y: [kf(0, tf.y + H * 0.8, "linear"), kf(last, tf.y - H * 0.8, "linear")] };   // rolling credits: bottom → top
  if (id === "crawl") return { x: [kf(0, tf.x + W * 0.9, "linear"), kf(last, tf.x - W * 0.9, "linear")] };    // ticker: right → left
  if (id === "kenburns") return { scale: [kf(0, tf.scale), kf(last, tf.scale * 1.15, "linear")], x: [kf(0, tf.x - W * 0.02), kf(last, tf.x + W * 0.02, "linear")] };
  return {};
}
const dedupe = (ks: Keyframe[]) => ks.filter((k, i) => i === 0 || k.t > ks[i - 1].t);

const LIMITS: Record<P, [number, number]> = { x: [-10000, 10000], y: [-10000, 10000], scale: [0.05, 10], rotation: [-360, 360], opacity: [0, 1] };

/** Merge animation keyframes into a clip's keyframes: replaces the animated properties, leaves others alone. */
export function applyAnimation(c: Clip, keys: Partial<Record<P, Keyframe[]>>): Keyframes {
  const out: Keyframes = { ...(c.keyframes ?? {}) };
  for (const p of Object.keys(keys) as P[]) {
    const ks = keys[p]!;
    if (ks.length < 2) continue;
    // in/out animations keep the clip's existing keys in the untouched middle section
    const lo = ks[0].t, hi = ks[ks.length - 1].t;
    const keep = (out[p] ?? []).filter((k) => k.t < lo || k.t > hi);
    const [lo2, hi2] = LIMITS[p];
    out[p] = [...keep, ...ks.map((k) => ({ ...k, v: Math.min(hi2, Math.max(lo2, k.v)) }))].sort((a, b) => a.t - b.t).slice(0, 64);
  }
  return out;
}

// ---------- text styles (presets of the title's existing fields; preview and export already draw these)
export const TEXT_STYLES: { name: string; patch: Partial<Title> }[] = [
  { name: "Bold Outline", patch: { color: "#ffffff", stroke: 6, stroke_color: "#000000", bg_color: null, shadow: 0 } },
  { name: "YouTube Box", patch: { color: "#ffffff", bg_color: "#ff0033", bg_opacity: 1, stroke: 0, shadow: 0 } },
  { name: "Subtitle Yellow", patch: { color: "#ffe14d", stroke: 4, stroke_color: "#000000", bg_color: null, shadow: 0.5 } },
  { name: "Lower Third", patch: { color: "#ffffff", bg_color: "#111827", bg_opacity: 0.85, align: "left", stroke: 0, shadow: 0 } },
  { name: "Drop Shadow", patch: { color: "#ffffff", shadow: 0.85, stroke: 0, bg_color: null } },
  { name: "Minimal", patch: { color: "#ffffff", stroke: 0, shadow: 0, bg_color: null } },
  { name: "Black Bar", patch: { color: "#ffffff", bg_color: "#000000", bg_opacity: 0.7, stroke: 0, shadow: 0 } },
  { name: "Highlighter", patch: { color: "#111111", bg_color: "#fde047", bg_opacity: 1, stroke: 0, shadow: 0 } },
  { name: "Neon Pink", patch: { color: "#ff4fd8", stroke: 3, stroke_color: "#3b0a45", shadow: 0.6, bg_color: null } },
  { name: "Gaming Green", patch: { color: "#39ff14", stroke: 5, stroke_color: "#0a2a05", shadow: 0.5, bg_color: null } },
  { name: "Gold Luxe", patch: { color: "#f5c542", stroke: 2, stroke_color: "#4a3200", shadow: 0.7, bg_color: null } },
  { name: "Breaking News", patch: { color: "#ffffff", bg_color: "#b91c1c", bg_opacity: 0.95, align: "left", stroke: 0, shadow: 0 } },
];

export const timelineHasEffects = (tl: Timeline) => tl.tracks.some((t) => t.clips.some((c) => (c.effects?.length ?? 0) > 0));
