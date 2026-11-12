import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowUpRight, Play, Sparkles, Scissors, Send, Wand2 } from "lucide-react";
import "../story.css";

const chapters = [
  { word: "Imagine.", label: "A spark becomes a story", text: "The place you went. The thing you learned. The idea you can't stop thinking about. Every great video starts with something worth sharing.", detail: "Your perspective is the starting point.", icon: Sparkles },
  { word: "Create.", label: "Give your idea a world", text: "Find your words, explore the AI studios, and bring your own footage into the picture. Build a collection of moments that feels like you.", detail: "Scripts · visuals · sound", icon: Wand2 },
  { word: "Edit.", label: "Find the feeling in every frame", text: "Shape the rhythm on a multitrack timeline. Refine your colours, add your titles, and let the right moments breathe.", detail: "Timeline · colour · captions", icon: Scissors },
  { word: "Share.", label: "Let your story travel", text: "Turn a long video into a new perspective. Reframe for Shorts, export your finished film, and take your next story to your audience.", detail: "One idea. More ways to tell it.", icon: Send },
];

/** Original vector scenery, shared by the cover and scroll-driven film preview. */
export function StoryLandscape() {
  const id = useId().replace(/:/g, "");
  return <svg className="story-landscape" viewBox="0 0 900 620" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs>
      <linearGradient id={`${id}-sky`} x2="0" y2="1"><stop stopColor="#232042" /><stop offset=".48" stopColor="#ac6071" /><stop offset="1" stopColor="#ffc595" /></linearGradient>
      <linearGradient id={`${id}-land`} x2=".4" y2="1"><stop stopColor="#6e4d75" /><stop offset="1" stopColor="#17172c" /></linearGradient>
      <linearGradient id={`${id}-river`} x2="0" y2="1"><stop stopColor="#d19fa8" /><stop offset="1" stopColor="#655286" /></linearGradient>
      <radialGradient id={`${id}-light`}><stop stopColor="#ffdbb4" stopOpacity=".5" /><stop offset="1" stopColor="#ffdbb4" stopOpacity="0" /></radialGradient>
    </defs>
    <path fill={`url(#${id}-sky)`} d="M0 0h900v620H0z" />
    <circle cx="575" cy="235" r="215" fill={`url(#${id}-light)`} />
    <circle cx="575" cy="235" r="64" fill="#ffcfab" />
    <path d="M0 340 110 200 175 268 270 135 410 305 480 263 580 330 710 178 900 335V620H0Z" fill="#815c7e" />
    <path d="m270 135-48 114 48-28 35 22-13-43 76 62Z" fill="#cf9baa" opacity=".7" />
    <path d="M0 390 125 300 285 374 425 286 550 385 730 290 900 375V620H0Z" fill={`url(#${id}-land)`} />
    <path d="M528 367C359 419 657 420 481 474S365 537 407 620H685C429 505 759 460 567 425S506 391 528 367" fill={`url(#${id}-river)`} />
    <path d="M0 424 110 395 280 474 341 526 309 620H0Z" fill="#1f2037" />
    <path d="M900 401 802 439 744 497 729 562 773 620H900Z" fill="#191a2f" />
    <path d="M0 555 103 520 220 539 328 595 380 620H0Z" fill="#101322" />
    <circle cx="183" cy="494" r="6" fill="#121422" /><path d="m179 500-5 25 7 1-3 20h5l3-19 6 18h5l-7-23-2-20Z" fill="#121422" />
    <path d="m102 133 9-4 9 4m21-13 7-3 7 3" fill="none" stroke="#f5c3b0" strokeWidth="2" />
  </svg>;
}

export default function CreatorStory({ liveTools }: { liveTools?: number }) {
  const root = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const steps = Array.from(el.querySelectorAll<HTMLElement>(".story-chapter"));
    let frame = 0;
    const update = () => {
      frame = 0;
      const middle = window.innerHeight * .5;
      let nearest = 0, distance = Infinity;
      steps.forEach((step, i) => {
        const r = step.getBoundingClientRect();
        const d = Math.abs(r.top + r.height / 2 - middle);
        if (d < distance) { nearest = i; distance = d; }
      });
      setActive(nearest);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("scroll", schedule); window.removeEventListener("resize", schedule); };
  }, []);

  return <>
    <section className="story-cover" aria-labelledby="story-title">
      <div className="story-cover-art"><StoryLandscape /><div className="story-cover-shade" /></div>
      <div className="story-cover-content">
        <p className="story-kicker"><span /> A universe for your imagination</p>
        <h1 id="story-title">Every story<br />starts with <em>you.</em></h1>
        <p className="story-intro">A little imagination. A world of possibilities.<br />Your creative journey, from the first spark to the final frame.</p>
        <div className="story-actions"><Link to="/signup" className="story-button">Start your story <ArrowUpRight size={20} /></Link><a href="#creator-journey" className="story-explore">Explore the journey <ArrowDown size={17} /></a></div>
      </div>
      <div className="story-cover-foot"><span>YOUR IDEAS. BEAUTIFULLY IN MOTION.</span><span>Video editing + AI studios</span><a href="#creator-journey" aria-label="Scroll to the creative journey"><ArrowDown size={20} /></a></div>
      <span className="story-frame-label">THE BEGINNING / 01</span>
    </section>

    <section ref={root} className="creator-journey" id="creator-journey" aria-label="From your first idea to your finished video" data-chapter={active}>
      <div className="story-sticky">
        <div className="story-stage" aria-hidden="true">
          <div className="story-orbit orbit-one" /><div className="story-orbit orbit-two" />
          <span className="story-stage-word">{chapters[active].word}</span>
          <div className="story-film">
            <div className="story-film-top"><span><i /> YOUR NEXT STORY</span><span>CREATOR UNIVERSE</span></div>
            <div className="story-film-picture"><StoryLandscape /><span className="story-film-title">Somewhere<br /><em>new.</em></span><span className="story-play"><Play size={19} fill="currentColor" /></span></div>
            <div className="story-timeline"><span /><span /><span /><i /></div>
          </div>
          <div className="story-floating story-prompt"><Sparkles size={16} /><span>A journey beyond the everyday…</span></div>
          <div className="story-floating story-format"><span>9:16</span><b>A new perspective.</b><small>Made for Shorts</small></div>
          <div className="story-stage-caption"><span>0{active + 1} / 04</span><span>{chapters[active].detail}</span></div>
        </div>
      </div>
      <div className="story-chapters">
        {chapters.map(({ word, label, text, detail, icon: Icon }, i) => <article key={word} id={`story-chapter-${i}`} className={`story-chapter${active === i ? " is-current" : ""}`}>
          <p className="story-kicker"><Icon size={16} /> CHAPTER 0{i + 1}</p>
          <h2>{word}</h2><h3>{label}</h3><p>{text}</p><span className="story-detail">{detail}</span>
          {i === 3 && <Link to="/signup" className="story-button">Make your first story <ArrowUpRight size={18} /></Link>}
        </article>)}
      </div>
    </section>
    <section className="story-interlude" aria-labelledby="story-interlude-title"><p className="story-kicker">Your imagination. Your workspace.</p><h2 id="story-interlude-title">Big ideas deserve<br /><em>room to play.</em></h2><p>Explore the editor{liveTools !== undefined ? ` and ${liveTools} available AI tools` : " and the available AI studios"}. Find your starting point below.</p><a href="#workspaces" className="story-explore">Find your workspace <ArrowDown size={18} /></a></section>
  </>;
}
