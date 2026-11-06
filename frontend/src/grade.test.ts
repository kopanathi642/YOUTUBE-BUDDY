import { describe, expect, it } from "vitest";
import { NEUTRAL, gradePixel, wheelToRgb, rgbToWheel, isNeutral, withLook } from "./grade";

describe("grade", () => {
  it("neutral grade is identity", () => {
    expect(gradePixel(NEUTRAL, [0.2, 0.5, 0.8]).map((v) => +v.toFixed(4))).toEqual([0.2, 0.5, 0.8]);
    expect(isNeutral(NEUTRAL)).toBe(true);
    expect(isNeutral(withLook({ saturation: 0.5 }))).toBe(false);
  });
  it("gain warms grey exactly like the backend test expects", () => {
    const [r, g, b] = gradePixel({ ...NEUTRAL, gain: [1.6, 1, 0.6] }, [0.5, 0.5, 0.5]);
    expect(r).toBeCloseTo(0.8); expect(g).toBeCloseTo(0.5); expect(b).toBeCloseTo(0.3);
  });
  it("saturation 0 makes grey", () => {
    const [r, g, b] = gradePixel({ ...NEUTRAL, saturation: 0 }, [1, 0, 0]);
    expect(r).toBeCloseTo(g, 3); expect(g).toBeCloseTo(b, 3);
  });
  it("wheels round-trip", () => {
    for (const key of ["lift", "gamma", "gain", "offset"] as const) {
      const v = wheelToRgb(key, 0.3, -0.6, key === "gamma" || key === "gain" ? 1.1 : 0.05);
      const w = rgbToWheel(key, v);
      expect(w.x).toBeCloseTo(0.3, 3); expect(w.y).toBeCloseTo(-0.6, 3);
    }
  });
});

import { monotoneCurve, curveTables, NEUTRAL as N2, isNeutral as isN, sanitizeGrade as sg } from "./grade";
import { applyLut, parseCube } from "./lut";

describe("curves match the server (backend/app/colorlut.py) exactly", () => {
  const S: [number, number][] = [[0, 0], [0.25, 0.15], [0.75, 0.85], [1, 1]];
  it("same monotone cubic values as Python", () => {
    const f = monotoneCurve(S);
    expect([0.1, 0.6, 0.9].map((x) => +f(x).toFixed(5))).toEqual([0.0504, 0.6568, 0.9496]);
    const ys = Array.from({ length: 201 }, (_, i) => f(i / 200));
    expect(ys.every((y, i) => i === 0 || y >= ys[i - 1] - 1e-12)).toBe(true);
  });
  it("tables compose master then channel, and the grade uses them", () => {
    const [r, g] = curveTables({ master: S, r: [[0, 0.1], [1, 1]], g: [[0, 0], [1, 1]], b: [[0, 0], [1, 1]] });
    expect(r[0]).toBeCloseTo(0.1, 5);
    expect(g[128]).toBeCloseTo(monotoneCurve(S)(128 / 255), 5);
    const out = gradePixel({ ...N2, curves: { master: S, r: [[0, 0], [1, 1]], g: [[0, 0], [1, 1]], b: [[0, 0], [1, 1]] } }, [0.25, 0.25, 0.25]);
    expect(out[0]).toBeCloseTo(0.15, 2);
  });
  it("identity curves and 0 % LUT count as neutral; sanitize keeps curves + LUT", () => {
    expect(isN({ ...N2, curves: { master: [[0, 0], [1, 1]], r: [[0, 0], [1, 1]], g: [[0, 0], [1, 1]], b: [[0, 0], [1, 1]] } })).toBe(true);
    expect(isN({ ...N2, lut: { asset_id: "x", strength: 0 } })).toBe(true);
    expect(isN({ ...N2, lut: { asset_id: "x", strength: 0.4 } })).toBe(false);
    expect(sg({ lut: { asset_id: "x", strength: 3 } }).lut).toEqual({ asset_id: "x", strength: 1 });
  });
});

describe("3D LUT preview", () => {
  const inv = "LUT_3D_SIZE 2\n" + [0, 1].flatMap((b) => [0, 1].flatMap((g) => [0, 1].map((r) => `${1 - r} ${1 - g} ${1 - b}`))).join("\n");
  it("parses and applies with strength", () => {
    const l = parseCube(inv);
    expect(l.size).toBe(2);
    expect(applyLut(l, 0.25, 0.5, 0.75, 1).map((v) => +v.toFixed(3))).toEqual([0.75, 0.5, 0.25]);
    expect(applyLut(l, 0.2, 0.9, 0.4, 0.5).map((v) => +v.toFixed(3))).toEqual([0.5, 0.5, 0.5]);
  });
  it("rejects bad files", () => {
    expect(() => parseCube("LUT_1D_SIZE 3\n0 0 0")).toThrow(/1D/);
    expect(() => parseCube("LUT_3D_SIZE 2\n0 0 0")).toThrow(/Expected 8/);
  });
});
