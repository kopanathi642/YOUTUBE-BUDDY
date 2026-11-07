import { useEffect, useRef } from "react";
import { Captions, Check, Palette, Smartphone } from "lucide-react";

/**
 * The landing page's 3D "studio" scene: an editor window with floating feature cards at different depths.
 * Pure CSS 3D (no WebGL library), so it costs a few KB. The whole rig tilts toward the pointer; each card floats
 * on its own rhythm. Everything here mirrors a real feature (timeline, Hindi captions, dubbing, 9:16 Shorts,
 * colour grading). Motion stops for people who ask their system for reduced motion.
 */
export default function HeroScene() {
  const rig = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = rig.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0, tx = 0, ty = 0, x = 0, y = 0;
    const onMove = (e: PointerEvent) => { tx = (e.clientX / window.innerWidth - 0.5) * 2; ty = (e.clientY / window.innerHeight - 0.5) * 2; };
    const tick = () => {
      x += (tx - x) * 0.06; y += (ty - y) * 0.06;   // eased follow, no jitter
      el.style.setProperty("--ry", `${(-14 + x * 9).toFixed(2)}deg`);
      el.style.setProperty("--rx", `${(9 - y * 7).toFixed(2)}deg`);
      raf = requestAnimationFrame(tick);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    raf = requestAnimationFrame(tick);
    return () => { window.removeEventListener("pointermove", onMove); cancelAnimationFrame(raf); };
  }, []);

  return (
    <div className="lp-scene" aria-hidden>
      <div className="lp-orb" />
      <div className="lp-rig" ref={rig}>
        <div className="lp-floor" />
        <div className="lp-win">
          <div className="lp-win-bar"><i /><i /><i /><span>Main sequence · 1080p</span></div>
          <div className="lp-monitor">
            <div className="lp-shot" />
            <div className="lp-sub">नमस्ते दोस्तों, आज हम…</div>
          </div>
          <div className="lp-tl">
            <div className="lp-track"><b style={{ left: "2%", width: "30%" }} className="v" /><b style={{ left: "33%", width: "22%" }} className="v" /><b style={{ left: "56%", width: "38%" }} className="v" /></div>
            <div className="lp-track"><b style={{ left: "12%", width: "26%" }} className="t" /><b style={{ left: "60%", width: "18%" }} className="t" /></div>
            <div className="lp-track wave">{Array.from({ length: 46 }, (_, i) => <s key={i} style={{ height: `${22 + Math.abs(Math.sin(i * 1.7) * 70)}%` }} />)}</div>
            <div className="lp-playhead" />
          </div>
        </div>

        <div className="lp-float f1"><div className="lp-chip"><Captions size={15} /><div><b>Captions</b><span>Hindi · auto-timed</span></div></div></div>
        <div className="lp-float f2"><div className="lp-phone"><div className="lp-phone-shot" /><span><Smartphone size={11} /> 9:16 Short</span></div></div>
        <div className="lp-float f3"><div className="lp-chip"><span className="lp-bars">{[0, 1, 2, 3, 4].map((i) => <i key={i} style={{ animationDelay: `${i * 0.12}s` }} />)}</span><div><b>Dub ready</b><span>English → Hindi</span></div><Check size={14} className="lp-ok" /></div></div>
        <div className="lp-float f4"><div className="lp-wheel"><Palette size={14} /></div></div>
      </div>
    </div>
  );
}

/** Lift-and-tilt toward the pointer for cards inside `root` that match `selector`. */
export function useTilt(root: React.RefObject<HTMLElement | null>, selector: string, active: boolean) {
  useEffect(() => {
    const el = root.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches || !window.matchMedia("(hover: hover)").matches) return;
    const move = (e: PointerEvent) => {
      const card = (e.target as HTMLElement).closest<HTMLElement>(selector);
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty("--tx", `${(((e.clientY - r.top) / r.height) - 0.5) * -8}deg`);
      card.style.setProperty("--ty", `${(((e.clientX - r.left) / r.width) - 0.5) * 10}deg`);
      card.style.setProperty("--gx", `${((e.clientX - r.left) / r.width) * 100}%`);
      card.style.setProperty("--gy", `${((e.clientY - r.top) / r.height) * 100}%`);
    };
    const leave = (e: PointerEvent) => {
      const card = (e.target as HTMLElement).closest<HTMLElement>(selector);
      if (card && !card.contains(e.relatedTarget as Node)) { card.style.removeProperty("--tx"); card.style.removeProperty("--ty"); }
    };
    el.addEventListener("pointermove", move); el.addEventListener("pointerout", leave);
    return () => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerout", leave); };
  }, [root, selector, active]);
}

/** Fade-and-rise sections into view. Content is only hidden once JS runs, so crawlers and no-JS readers see everything. */
export function useReveal(root: React.RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    const el = root.current;
    if (!el || !("IntersectionObserver" in window) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    el.classList.add("lp-js");
    const io = new IntersectionObserver((es) => es.forEach((x) => { if (x.isIntersecting) { x.target.classList.add("in"); io.unobserve(x.target); } }),
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    el.querySelectorAll(".lp-reveal").forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, [root, active]);
}
