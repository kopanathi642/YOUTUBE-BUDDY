import { describe, expect, it } from "vitest";
import { earnings, hashtags, monetization, parseTime, videoId, FREE_TOOLS } from "./catalog";

describe("free tools helpers", () => {
  it("finds the video id in every common link", () => {
    for (const u of ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10", "youtu.be/dQw4w9WgXcQ?si=x", "https://youtube.com/shorts/dQw4w9WgXcQ",
      "https://www.youtube.com/embed/dQw4w9WgXcQ", "https://m.youtube.com/watch?feature=x&v=dQw4w9WgXcQ", "https://www.youtube.com/live/dQw4w9WgXcQ", "dQw4w9WgXcQ"])
      expect(videoId(u), u).toBe("dQw4w9WgXcQ");
    expect(videoId("https://example.com/watch?v=abc")).toBeNull();
  });
  it("reads times", () => {
    expect(parseTime("1:02:03")).toBe(3723); expect(parseTime("2:30")).toBe(150); expect(parseTime("90")).toBe(90);
    expect(parseTime("")).toBe(0); expect(parseTime("abc")).toBeNull();
  });
  it("makes clean unique hashtags", () => {
    expect(hashtags(["Goa Trip", "goa trip", "goa trip vlog!", "गोवा यात्रा"])).toEqual(["#goatrip", "#goatripvlog", "#गोवायात्रा"]);
    expect(hashtags(Array.from({ length: 40 }, (_, i) => "tag " + i)).length).toBe(15);
  });
  it("applies the Partner Programme thresholds", () => {
    expect(monetization({ subs: 1000, hours: 4000, shorts: 0, uploads: 0 }).full.ok).toBe(true);
    expect(monetization({ subs: 1000, hours: 10, shorts: 10_000_000, uploads: 0 }).full.ok).toBe(true);
    const r = monetization({ subs: 600, hours: 3100, shorts: 0, uploads: 3 });
    expect(r.early.ok).toBe(true); expect(r.full.ok).toBe(false); expect(r.full.missing[0]).toContain("400 more subscribers");
    expect(monetization({ subs: 500, hours: 3000, shorts: 0, uploads: 2 }).early.ok).toBe(false);
  });
  it("estimates earnings as a range", () => {
    expect(earnings(100000, 0, [20, 100], [2, 8])).toEqual({ low: 2000, high: 10000 });
    expect(earnings(100000, 100, [20, 100], [2, 8])).toEqual({ low: 200, high: 800 });
  });
  it("slugs are unique", () => { expect(new Set(FREE_TOOLS.map((t) => t.slug)).size).toBe(FREE_TOOLS.length); });
});
