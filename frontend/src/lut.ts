// 3D .cube LUTs in the browser — used for the LUT tab's before/after preview. The export applies the same LUT with
// FFmpeg lut3d (tetrahedral); this preview uses trilinear interpolation, which differs by at most a level or two.
import type { ColorGrade } from "./timeline";
import { curveTables, curvesIdentity, wb } from "./grade";

export type Lut3D = { size: number; data: Float32Array; title: string };

export function parseCube(text: string): Lut3D {
  let size = 0, title = "";
  const vals: number[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const k = line.split(/\s+/)[0].toUpperCase();
    if (k === "TITLE") title = line.slice(5).trim().replace(/^"|"$/g, "");
    else if (k === "LUT_3D_SIZE") size = parseInt(line.split(/\s+/)[1], 10);
    else if (k === "LUT_1D_SIZE") throw new Error("This is a 1D LUT — please choose a 3D .cube LUT");
    else if (/^[-\d.]/.test(k)) { const p = line.split(/\s+/).map(Number); if (p.length !== 3 || p.some((x) => !Number.isFinite(x))) throw new Error("Bad data line in LUT"); vals.push(...p); }
  }
  if (!(size >= 2 && size <= 65)) throw new Error("Missing or unsupported LUT_3D_SIZE (2–65)");
  if (vals.length !== size ** 3 * 3) throw new Error(`Expected ${size ** 3} colour rows, found ${vals.length / 3}`);
  return { size, data: Float32Array.from(vals), title };
}

/** Trilinear lookup, red fastest, blended with identity by `strength`. In/out 0..1. */
export function applyLut(l: Lut3D, r: number, g: number, b: number, strength = 1): [number, number, number] {
  const n = l.size - 1, d = l.data;
  const fx = Math.min(n, Math.max(0, r * n)), fy = Math.min(n, Math.max(0, g * n)), fz = Math.min(n, Math.max(0, b * n));
  const x0 = Math.min(n - 1, Math.floor(fx)), y0 = Math.min(n - 1, Math.floor(fy)), z0 = Math.min(n - 1, Math.floor(fz));
  const tx = fx - x0, ty = fy - y0, tz = fz - z0;
  const at = (x: number, y: number, z: number, c: number) => d[((z * l.size + y) * l.size + x) * 3 + c];
  const out: [number, number, number] = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const c00 = at(x0, y0, z0, c) * (1 - tx) + at(x0 + 1, y0, z0, c) * tx, c10 = at(x0, y0 + 1, z0, c) * (1 - tx) + at(x0 + 1, y0 + 1, z0, c) * tx;
    const c01 = at(x0, y0, z0 + 1, c) * (1 - tx) + at(x0 + 1, y0, z0 + 1, c) * tx, c11 = at(x0, y0 + 1, z0 + 1, c) * (1 - tx) + at(x0 + 1, y0 + 1, z0 + 1, c) * tx;
    const v = (c00 * (1 - ty) + c10 * ty) * (1 - tz) + (c01 * (1 - ty) + c11 * ty) * tz;
    const src = c === 0 ? r : c === 1 ? g : b;
    out[c] = Math.min(1, Math.max(0, src + strength * (v - src)));
  }
  return out;
}

/** Grade + LUT an ImageData in place (preview). Per-channel tables are precomputed, so this is fast for thumbnails. */
export function gradeImageData(img: ImageData, g: ColorGrade, lut: Lut3D | null, strength: number) {
  const m = wb(g), cl = (x: number) => Math.min(1, Math.max(0, x));
  const tabs = [0, 1, 2].map((i) => Float32Array.from({ length: 256 }, (_, v) => {
    let y = cl((v / 255) * m[i]);
    y = cl(y * (g.gain[i] - g.lift[i]) + g.lift[i] + g.offset[i]);
    y = Math.pow(y, 1 / g.gamma[i]);
    return cl((y - 0.5) * g.contrast + 0.5);
  }));
  const ct = g.enabled && !curvesIdentity(g.curves) ? curveTables(g.curves!) : null;
  const s = g.saturation, px = img.data;
  for (let p = 0; p < px.length; p += 4) {
    let r = px[p] / 255, gg = px[p + 1] / 255, b = px[p + 2] / 255;
    if (g.enabled) {
      const v = [tabs[0][px[p]], tabs[1][px[p + 1]], tabs[2][px[p + 2]]];
      if (ct) for (let i = 0; i < 3; i++) { const q = v[i] * 255, k = Math.min(254, Math.floor(q)), f = q - k; v[i] = ct[i][k] * (1 - f) + ct[i][k + 1] * f; }
      [r, gg, b] = v;
      if (s !== 1) [r, gg, b] = [cl((0.213 + 0.787 * s) * r + (0.715 - 0.715 * s) * gg + (0.072 - 0.072 * s) * b),
        cl((0.213 - 0.213 * s) * r + (0.715 + 0.285 * s) * gg + (0.072 - 0.072 * s) * b), cl((0.213 - 0.213 * s) * r + (0.715 - 0.715 * s) * gg + (0.072 + 0.928 * s) * b)];
      if (lut && strength > 0) [r, gg, b] = applyLut(lut, r, gg, b, strength);
    }
    px[p] = Math.round(r * 255); px[p + 1] = Math.round(gg * 255); px[p + 2] = Math.round(b * 255);
  }
}
