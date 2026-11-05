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
