import { describe, expect, it } from "vitest";
import { Timeline, insertClip, moveClip, splitAt, splitAllAt, trimStart, trimEnd, deleteClip, duration, snap, framesToTimecode, freeSlot } from "./timeline";

const base = (): Timeline => ({ schema_version: 1, fps: 30, width: 1920, height: 1080, tracks: [
  { id: "v2", kind: "video", name: "V2", muted: false, hidden: false, locked: false, clips: [] },
  { id: "v1", kind: "video", name: "V1", muted: false, hidden: false, locked: false, clips: [] },
  { id: "a1", kind: "audio", name: "A1", muted: false, hidden: false, locked: false, clips: [] },
] });

describe("timeline ops", () => {
  it("inserts into the next free slot instead of overlapping", () => {
    let r = insertClip(base(), "v1", "A", 0, 0, 90)!;
    r = insertClip(r.tl, "v1", "B", 30, 0, 60)!;
    const clips = r.tl.tracks[1].clips;
    expect(clips[1].start).toBe(90);
    expect(duration(r.tl)).toBe(150);
  });
  it("refuses overlapping moves and cross-kind moves", () => {
    let r = insertClip(base(), "v1", "A", 0, 0, 90)!;
    const b = insertClip(r.tl, "v1", "B", 100, 0, 30)!;
    expect(moveClip(b.tl, b.id, "v1", 50)).toBeNull();
    expect(moveClip(b.tl, b.id, "a1", 0)).toBeNull();
    expect(moveClip(b.tl, b.id, "v2", 50)!.tracks[0].clips[0].start).toBe(50);
  });
  it("splits frame-exactly and preserves source continuity", () => {
    const r = insertClip(base(), "v1", "A", 10, 5, 95)!;
    const s = splitAt(r.tl, r.id, 40)!;
    const [l, rt] = s.tl.tracks[1].clips;
    expect([l.start, l.in, l.out]).toEqual([10, 5, 35]);
    expect([rt.start, rt.in, rt.out]).toEqual([40, 35, 95]);
    expect(splitAt(r.tl, r.id, 10)).toBeNull();
    expect(splitAllAt(r.tl, 50).tracks[1].clips.length).toBe(2);
  });
  it("trims within source bounds", () => {
    const r = insertClip(base(), "v1", "A", 30, 30, 90)!;
    expect(trimStart(r.tl, r.id, 0)!.tracks[1].clips[0].in).toBe(0);
    expect(trimStart(r.tl, r.id, -5)).toBeNull(); // cannot reveal media before the source start
    expect(trimStart(r.tl, r.id, 10)!.tracks[1].clips[0].in).toBe(10);
    expect(trimEnd(r.tl, r.id, 200, 120)).toBeNull();
    expect(trimEnd(r.tl, r.id, 110, 120)!.tracks[1].clips[0].out).toBe(110);
  });
  it("ripple delete closes the gap", () => {
    let r = insertClip(base(), "v1", "A", 0, 0, 30)!;
    const b = insertClip(r.tl, "v1", "B", 30, 0, 30)!;
    const out = deleteClip(b.tl, r.id, true)!;
    expect(out.tracks[1].clips[0].start).toBe(0);
  });
  it("locked tracks reject edits", () => {
    const r = insertClip(base(), "v1", "A", 0, 0, 30)!;
    r.tl.tracks[1].locked = true;
    expect(deleteClip(r.tl, r.id)).toBeNull();
  });
  it("helpers", () => {
    expect(snap(52, [0, 50, 100], 3)).toBe(50);
    expect(snap(56, [0, 50, 100], 3)).toBe(56);
    expect(framesToTimecode(30 * 61 + 7, 30)).toBe("00:01:01:07");
    expect(freeSlot(base().tracks[0], 5, 10)).toBe(5);
  });
});
