// Colour grade maths shared by the preview (SVG filter, also used for scopes via canvas) and mirrored
// exactly by the backend FFmpeg compiler (backend/app/timeline.py: grade_filters).
import type { ColorGrade, Vec3 } from "./timeline";

export const NEUTRAL: ColorGrade = {
  enabled: true, lift: [0, 0, 0], gamma: [1, 1, 1], gain: [1, 1, 1], offset: [0, 0, 0],
  exposure: 0, contrast: 1, saturation: 1, temperature: 0, tint: 0,
};

export const isNeutral = (g?: ColorGrade | null) => !g || !g.enabled || JSON.stringify({ ...g, enabled: true }) === JSON.stringify(NEUTRAL);

export function wb(g: ColorGrade): Vec3 {
  const e = 2 ** g.exposure, t = g.temperature, ti = g.tint;
  return [e * (1 + 0.2 * t) * (1 + 0.1 * ti), e * (1 - 0.2 * ti), e * (1 - 0.2 * t) * (1 + 0.1 * ti)];
}

const n = (x: number) => +x.toFixed(5);

/** Inner markup for an SVG <filter> implementing the grade (sRGB space). */
export function svgFilterBody(g: ColorGrade): string {
  const m = wb(g), C = g.contrast, s = g.saturation;
  const fn = (_stage: string, f: (i: number) => string) =>
    `<feComponentTransfer>${["R", "G", "B"].map((c, i) => `<feFunc${c} ${f(i)}/>`).join("")}<feFuncA type="identity"/></feComponentTransfer>`;
  return [
    fn("wb", (i) => `type="linear" slope="${n(m[i])}" intercept="0"`),
    fn("lgo", (i) => `type="linear" slope="${n(g.gain[i] - g.lift[i])}" intercept="${n(g.lift[i] + g.offset[i])}"`),
    fn("gamma", (i) => `type="gamma" amplitude="1" exponent="${n(1 / g.gamma[i])}" offset="0"`),
    fn("contrast", () => `type="linear" slope="${n(C)}" intercept="${n(0.5 - 0.5 * C)}"`),
    s !== 1 ? `<feColorMatrix type="saturate" values="${n(s)}"/>` : "",
  ].join("");
}

/** Apply the same grade to one sRGB pixel (0..1) — used by tests and scopes fallbacks. */
export function gradePixel(g: ColorGrade, rgb: Vec3): Vec3 {
  const m = wb(g), cl = (x: number) => Math.min(1, Math.max(0, x));
  const o = rgb.map((x, i) => {
    let y = cl(x * m[i]);
    y = cl(y * (g.gain[i] - g.lift[i]) + g.lift[i] + g.offset[i]);
    y = Math.pow(y, 1 / g.gamma[i]);
    return cl((y - 0.5) * g.contrast + 0.5);
  }) as Vec3;
  const s = g.saturation;
  if (s === 1) return o;
  const [r, gg, b] = o;
  return [
    cl((0.213 + 0.787 * s) * r + (0.715 - 0.715 * s) * gg + (0.072 - 0.072 * s) * b),
    cl((0.213 - 0.213 * s) * r + (0.715 + 0.285 * s) * gg + (0.072 - 0.072 * s) * b),
    cl((0.213 - 0.213 * s) * r + (0.715 - 0.715 * s) * gg + (0.072 + 0.928 * s) * b),
  ];
}

// ---- colour wheels: master + zero-sum chroma vector (exactly invertible) ----
export type WheelKey = "lift" | "gamma" | "gain" | "offset";
export const WHEEL: Record<WheelKey, { identity: number; k: number; min: number; max: number }> = {
  lift: { identity: 0, k: 0.25, min: -0.5, max: 0.5 },
  gamma: { identity: 1, k: 0.6, min: 0.3, max: 3 },
  gain: { identity: 1, k: 0.6, min: 0, max: 2.5 },
  offset: { identity: 0, k: 0.25, min: -0.5, max: 0.5 },
};
const SQ3 = Math.sqrt(3) / 2;

/** Wheel state (x,y in -1..1, y up; master) -> RGB triple */
export function wheelToRgb(key: WheelKey, x: number, y: number, master: number): Vec3 {
  const k = WHEEL[key].k;
  return [master + k * x, master + k * (-x / 2 + SQ3 * y), master + k * (-x / 2 - SQ3 * y)].map((v) => n(v)) as Vec3;
}
export function rgbToWheel(key: WheelKey, v: Vec3): { x: number; y: number; master: number } {
  const k = WHEEL[key].k, m = (v[0] + v[1] + v[2]) / 3;
  const d = v.map((c) => c - m);
  return { x: d[0] / k, y: (d[1] - d[2]) / (2 * SQ3 * k), master: m };
}

export const LOOKS: { name: string; grade: Partial<ColorGrade> }[] = [
  { name: "Cinematic", grade: { lift: [-0.02, 0.0, 0.03], gain: [1.06, 1.0, 0.94], contrast: 1.15, saturation: 0.92 } },
  { name: "Filmic", grade: { gamma: [0.95, 0.95, 0.95], contrast: 1.1, saturation: 0.85, lift: [0.02, 0.02, 0.02] } },
  { name: "Teal-Orange", grade: { lift: [-0.03, 0.01, 0.05], gain: [1.12, 1.0, 0.86], saturation: 1.1, contrast: 1.08 } },
  { name: "Vintage", grade: { lift: [0.07, 0.05, 0.02], gain: [1.0, 0.96, 0.85], saturation: 0.7, contrast: 0.9 } },
  { name: "Vivid", grade: { saturation: 1.35, contrast: 1.1 } },
  { name: "Warm", grade: { temperature: 0.45 } },
  { name: "Cool", grade: { temperature: -0.45 } },
  { name: "B&W", grade: { saturation: 0, contrast: 1.15 } },
];
export const withLook = (look: Partial<ColorGrade>): ColorGrade => ({ ...NEUTRAL, ...look });

const clampV = (v: any, lo: number, hi: number, d: number) => { const x = Number(v); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d; };
const clamp3 = (v: any, lo: number, hi: number, d: number): Vec3 => [0, 1, 2].map((i) => clampV(v?.[i], lo, hi, d)) as Vec3;
/** Clamp any grade (e.g. a stored suggestion) into the ranges the server accepts. */
export function sanitizeGrade(g: Partial<ColorGrade> | null | undefined): ColorGrade {
  const x = { ...NEUTRAL, ...(g ?? {}) };
  return {
    enabled: x.enabled !== false, lift: clamp3(x.lift, -1, 1, 0), gamma: clamp3(x.gamma, 0.1, 10, 1), gain: clamp3(x.gain, 0, 4, 1),
    offset: clamp3(x.offset, -1, 1, 0), exposure: clampV(x.exposure, -4, 4, 0), contrast: clampV(x.contrast, 0, 3, 1),
    saturation: clampV(x.saturation, 0, 3, 1), temperature: clampV(x.temperature, -1, 1, 0), tint: clampV(x.tint, -1, 1, 0),
  };
}
