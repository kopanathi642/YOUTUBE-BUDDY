/* The pinned "stage" of the landing story: one clip that changes with each chapter as the visitor scrolls.
   Everything is drawn (SVG/CSS), nothing is downloaded. Progress arrives as CSS variables set on the page root:
   --sky (0..1 for the whole story) and --c1..--c6 (0..1 for each chapter). No React re-render per frame. */

const BARS = Array.from({ length: 28 }, (_, i) => 0.25 + 0.75 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.6)));

function Scene() {
  return (
    <svg className="st-scene" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id="sky-night" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#120f33" /><stop offset=".65" stopColor="#3b2a6b" /><stop offset="1" stopColor="#7a3f7a" />
        </linearGradient>
        <linearGradient id="sky-dawn" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4a3a8c" /><stop offset=".55" stopColor="#f08a5d" /><stop offset="1" stopColor="#ffd28a" />
        </linearGradient>
        <radialGradient id="sun" cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#fff3c4" /><stop offset=".5" stopColor="#ffc24a" /><stop offset="1" stopColor="#ffc24a" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="1600" height="900" fill="url(#sky-night)" />
      <rect className="st-dawn" width="1600" height="900" fill="url(#sky-dawn)" />
      <g className="st-stars" fill="#fff">
        {Array.from({ length: 40 }, (_, i) => <circle key={i} cx={(i * 397) % 1600} cy={(i * 131) % 460} r={i % 5 ? 1.6 : 2.6} opacity={0.4 + (i % 3) * 0.2} />)}
      </g>
      <circle className="st-sun" cx="930" cy="700" r="210" fill="url(#sun)" />
      {/* skyline: domes, a minaret, a water tank, flats: an Indian city at the edge of morning */}
      <path className="st-city far" d="M0 690 L90 690 L90 640 L150 640 L150 600 L210 600 L210 660 L300 660 L300 610 Q340 560 380 610 L380 670 L470 670 L470 590 L520 590 L520 650 L640 650 L640 620 L700 620 L700 680 L820 680 L820 600 L880 600 L880 660 L1000 660 L1000 630 L1080 630 L1080 680 L1180 680 L1180 620 L1260 620 L1260 670 L1380 670 L1380 610 L1440 610 L1440 660 L1600 660 L1600 900 L0 900 Z" />
      <path className="st-city near" d="M0 760 L120 760 L120 700 L180 700 L180 740 L260 740 L260 690 Q300 630 340 690 L340 760 L420 760 L420 560 L436 540 L452 560 L452 760 L560 760 L560 720 L600 720 L600 680 L660 680 L660 735 L760 735 L760 700 Q830 610 900 700 L900 760 L1010 760 L1010 712 L1060 712 L1060 690 L1110 690 L1110 640 L1150 640 L1150 690 L1200 690 L1200 745 L1310 745 L1310 705 L1400 705 L1400 750 L1500 750 L1500 715 L1600 715 L1600 900 L0 900 Z" />
      <g className="st-windows" fill="#ffd28a">
        {[[140, 720], [200, 752], [290, 712], [610, 700], [640, 712], [700, 752], [1030, 728], [1125, 660], [1125, 682], [1330, 725], [1420, 732], [1520, 735]].map(([x, y], i) => <rect key={i} x={x} y={y} width="10" height="12" rx="1" />)}
      </g>
      <g className="st-kite">
        <path d="M800 230 L860 300 L800 390 L740 300 Z" fill="#f5a524" />
        <path d="M800 230 L800 390 M740 300 L860 300" stroke="#7a2e1d" strokeWidth="3" />
        <path d="M800 390 C780 440 830 470 805 520 C785 560 820 590 800 640" stroke="#f7f1ff" strokeWidth="3" fill="none" opacity=".7" />
        <path d="M790 455 l-18 -8 l4 16 Z M812 525 l18 -6 l-6 15 Z" fill="#0e8c8c" />
      </g>
    </svg>
  );
}

export default function Stage() {
  return (
    <div className="lp-stage" aria-hidden>
      <div className="st-frame">
        <div className="st-clip"><Scene /></div>

        {/* 1 Import: a file drops in and is usable at once */}
        <div className="st-file"><span className="st-file-icon" /><div><b>kite_festival.mp4</b><span>148 MB · 4K</span></div><i className="st-ring" /></div>

        {/* 3 Captions + titles */}
        <div className="st-title"><span lang="ta" className="ta">பட்டத் திருவிழா</span><span lang="te" className="te">గాలిపటాల పండుగ</span></div>
        <div className="st-caps">
          <p className="st-cap en">The kite flew so high!</p>
          <p className="st-cap hi" lang="hi">पतंग बहुत ऊँची उड़ी!</p>
        </div>

        {/* 4 Dub */}
        <div className="st-voice"><span className="st-voice-label" lang="hi">हिन्दी आवाज़</span>
          <div className="st-bars">{BARS.map((h, i) => <i key={i} style={{ ["--h" as string]: h, animationDelay: `${(i % 7) * 90}ms` }} />)}</div>
        </div>

        {/* 5 Reframe: the subject box that keeps the kite centred */}
        <div className="st-track" />

        {/* 6 Grow */}
        <div className="st-views"><b>Views</b>
          <svg className="st-chart" viewBox="0 0 220 90" preserveAspectRatio="none"><path d="M4 84 C40 80 60 76 84 64 S130 52 150 34 S196 10 216 6" /></svg></div>
        <span className="st-pub">Published</span>
      </div>

      {/* 2 Cut: the timeline under the frame */}
      <div className="st-timeline">
        <div className="st-row v"><i className="st-c a" /><i className="st-gap" /><i className="st-c b" /></div>
        <div className="st-row a"><i className="st-wave" /></div>
        <span className="st-head" />
      </div>
      <div className="st-shorts"><i /><i /></div>
    </div>
  );
}
