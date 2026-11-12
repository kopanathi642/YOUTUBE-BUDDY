import { useEffect, useState, type RefObject } from "react";
import Lenis from "lenis";

/** Drives the landing story from the scroll position.
 *  Writes CSS variables on the page root, so animation never re-renders React:
 *   --sky  0..1 progress through the whole story (night → dawn)
 *   --c1..--c6  0..1 progress of each chapter (0 before it, 1 after it)
 *  Returns the active chapter index for the step counter and text emphasis.
 *  Smooth scrolling (Lenis) only when the visitor hasn't asked for reduced motion. */
export function useScrollStory(root: RefObject<HTMLElement | null>, active: boolean) {
  const [current, setCurrent] = useState(0);
  useEffect(() => {
    const el = root.current;
    if (!active || !el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const lenis = reduced ? null : new Lenis({ lerp: 0.11, autoRaf: true, anchors: { offset: -64 } });
    let raf = 0, last = -1;

    const measure = () => {
      const chapters = [...el.querySelectorAll<HTMLElement>(".lp-ch")];
      const story = el.querySelector<HTMLElement>(".lp-story");
      if (!story || !chapters.length) return;
      const vh = window.innerHeight;
      const mid = vh * 0.55;                               // a chapter "plays" while it crosses the middle of the screen
      let idx = 0;
      chapters.forEach((c, i) => {
        const r = c.getBoundingClientRect();
        const p = Math.min(1, Math.max(0, (mid - r.top) / Math.max(1, r.height)));
        el.style.setProperty(`--c${i + 1}`, p.toFixed(3));
        if (r.top < mid) idx = i;
      });
      const s = story.getBoundingClientRect();
      const sky = Math.min(1, Math.max(0, (mid - s.top) / Math.max(1, s.height - vh * 0.4)));
      el.style.setProperty("--sky", sky.toFixed(3));
      if (idx !== last) { last = idx; setCurrent(idx); }
    };
    // measure only when something moved (no work while the page sits still)
    const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; measure(); }); };
    lenis?.on("scroll", schedule);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    measure();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", schedule); window.removeEventListener("resize", schedule);
      lenis?.destroy();
    };
  }, [root, active]);
  return current;
}
