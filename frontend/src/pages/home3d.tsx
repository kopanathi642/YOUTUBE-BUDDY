/* 3D-style illustration pieces for the signed-out home page (pure SVG/CSS, no images, no network).
   Lit like the founder's brief: obsidian ground, cyan + violet rim light, chrome highlights. */

let uid = 0;
const id = (p: string) => `${p}${++uid}`;

/* ---------- Bento icons ---------- */

export function FilmReel3D() {
  const g = id("fr"), c = id("frc");
  return (
    <svg viewBox="0 0 80 80" width="72" height="72" aria-hidden>
      <defs>
        <radialGradient id={g} cx="35%" cy="30%" r="75%"><stop offset="0" stopColor="#f5f3ff" /><stop offset=".35" stopColor="#a78bfa" /><stop offset="1" stopColor="#3b0764" /></radialGradient>
        <linearGradient id={c} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#e2e8f0" /><stop offset="1" stopColor="#475569" /></linearGradient>
      </defs>
      <ellipse cx="40" cy="72" rx="24" ry="4" fill="#000" opacity=".45" />
      <path d="M52 56c6 6 14 6 22 2" stroke={`url(#${c})`} strokeWidth="5" fill="none" strokeLinecap="round" />
      <circle cx="38" cy="38" r="28" fill={`url(#${g})`} />
      <circle cx="38" cy="38" r="28" fill="none" stroke="#c4b5fd" strokeOpacity=".7" strokeWidth="1.5" />
      {[0, 72, 144, 216, 288].map((a) => <circle key={a} cx={38 + 15 * Math.cos((a * Math.PI) / 180)} cy={38 + 15 * Math.sin((a * Math.PI) / 180)} r="6" fill="#1e1036" />)}
      <circle cx="38" cy="38" r="5" fill={`url(#${c})`} />
      <ellipse cx="28" cy="22" rx="9" ry="4" fill="#fff" opacity=".35" transform="rotate(-30 28 22)" />
    </svg>
  );
}

export function HoloMic3D() {
  const g = id("mic"), s = id("mics");
  return (
    <svg viewBox="0 0 80 80" width="72" height="72" aria-hidden>
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fbcfe8" /><stop offset=".45" stopColor="#ec4899" /><stop offset="1" stopColor="#6d28d9" /></linearGradient>
        <linearGradient id={s} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f1f5f9" /><stop offset="1" stopColor="#64748b" /></linearGradient>
      </defs>
      <ellipse cx="40" cy="73" rx="18" ry="3.5" fill="#000" opacity=".45" />
      <rect x="27" y="6" width="26" height="40" rx="13" fill={`url(#${g})`} />
      {[14, 20, 26, 32, 38].map((y) => <line key={y} x1="30" x2="50" y1={y} y2={y} stroke="#fff" strokeOpacity=".28" strokeWidth="1.4" />)}
      <path d="M20 34a20 20 0 0 0 40 0" fill="none" stroke={`url(#${s})`} strokeWidth="4" strokeLinecap="round" />
      <rect x="37" y="54" width="6" height="12" fill={`url(#${s})`} />
      <rect x="27" y="65" width="26" height="5" rx="2.5" fill={`url(#${s})`} />
      <ellipse cx="34" cy="14" rx="3" ry="7" fill="#fff" opacity=".4" />
      <g stroke="#67e8f9" strokeLinecap="round" fill="none" className="ch3-ring">
        <path d="M10 22c-4 8-4 16 0 24" strokeWidth="2" /><path d="M70 22c4 8 4 16 0 24" strokeWidth="2" />
      </g>
    </svg>
  );
}

export function AIChip3D() {
  const g = id("chip"), t = id("chipt");
  return (
    <svg viewBox="0 0 80 80" width="72" height="72" aria-hidden>
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#334155" /><stop offset="1" stopColor="#0f172a" /></linearGradient>
        <linearGradient id={t} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fde68a" /><stop offset="1" stopColor="#f59e0b" /></linearGradient>
      </defs>
      <ellipse cx="40" cy="72" rx="24" ry="4" fill="#000" opacity=".45" />
      {[22, 32, 42, 52].map((p) => <g key={p} stroke={`url(#${t})`} strokeWidth="3" strokeLinecap="round"><path d={`M${p + 2} 12v-6`} /><path d={`M${p + 2} 64v6`} /><path d={`M12 ${p + 2}h-6`} /><path d={`M64 ${p + 2}h6`} /></g>)}
      <rect x="12" y="12" width="52" height="52" rx="10" fill={`url(#${g})`} stroke="#f59e0b" strokeOpacity=".6" />
      <rect x="22" y="22" width="32" height="32" rx="7" fill="#0b0b14" stroke="#fbbf24" strokeOpacity=".5" />
      <text x="38" y="44" textAnchor="middle" fontFamily="Space Grotesk, Inter, sans-serif" fontWeight="700" fontSize="15" fill="#fde68a">AI</text>
      <path d="M16 18l10-4" stroke="#fff" strokeOpacity=".35" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function ColorWheel3D() {
  const s = id("cws");
  return (
    <svg viewBox="0 0 80 80" width="72" height="72" aria-hidden>
      <defs><radialGradient id={s} cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#fff" /><stop offset=".55" stopColor="#fff" stopOpacity=".15" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></radialGradient></defs>
      <ellipse cx="40" cy="73" rx="22" ry="3.5" fill="#000" opacity=".45" />
      <foreignObject x="10" y="8" width="60" height="60"><div style={{ width: 60, height: 60, borderRadius: "50%", background: "conic-gradient(#ef4444,#f59e0b,#eab308,#22c55e,#06b6d4,#3b82f6,#8b5cf6,#ec4899,#ef4444)" }} /></foreignObject>
      <circle cx="40" cy="38" r="30" fill={`url(#${s})`} />
      <circle cx="40" cy="38" r="30" fill="none" stroke="#e2e8f0" strokeOpacity=".8" strokeWidth="2" />
      <circle cx="49" cy="31" r="4" fill="#fff" stroke="#0f172a" strokeWidth="1.5" className="ch3-puck" />
    </svg>
  );
}

export function MagicWand3D() {
  const g = id("wand");
  return (
    <svg viewBox="0 0 80 80" width="72" height="72" aria-hidden>
      <defs><linearGradient id={g} x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#0f172a" /><stop offset=".6" stopColor="#334155" /><stop offset="1" stopColor="#e2e8f0" /></linearGradient></defs>
      <ellipse cx="34" cy="73" rx="22" ry="3.5" fill="#000" opacity=".45" />
      <rect x="12" y="34" width="54" height="9" rx="4.5" transform="rotate(-40 39 38)" fill={`url(#${g})`} />
      <rect x="49" y="16" width="14" height="9" rx="3" transform="rotate(-40 56 20)" fill="#a7f3d0" />
      {[[62, 8, "#34d399"], [70, 18, "#22d3ee"], [56, 2, "#a78bfa"], [74, 6, "#f472b6"], [66, 28, "#fde68a"]].map(([x, y, c], i) => (
        <rect key={i} x={x as number} y={y as number} width="5" height="5" rx="1" fill={c as string} className="ch3-pixel" style={{ animationDelay: `${i * 0.25}s` }} />
      ))}
    </svg>
  );
}

export function Timeline3D() {
  return (
    <svg viewBox="0 0 80 80" width="72" height="72" aria-hidden>
      <ellipse cx="40" cy="73" rx="28" ry="3.5" fill="#000" opacity=".45" />
      <g transform="skewY(-8) translate(0 8)">
        <rect x="6" y="14" width="68" height="50" rx="8" fill="#0b1324" stroke="#22d3ee" strokeOpacity=".6" />
        <rect x="12" y="22" width="26" height="9" rx="3" fill="#06b6d4" /><rect x="40" y="22" width="28" height="9" rx="3" fill="#8b5cf6" />
        <rect x="12" y="35" width="38" height="9" rx="3" fill="#6366f1" /><rect x="52" y="35" width="16" height="9" rx="3" fill="#22d3ee" opacity=".7" />
        <rect x="12" y="48" width="56" height="8" rx="3" fill="#10b981" opacity=".55" />
        <rect x="44" y="18" width="2" height="42" fill="#fff" className="ch3-head" />
      </g>
    </svg>
  );
}

export function Globe3D() {
  const g = id("gl");
  return (
    <svg viewBox="0 0 80 80" width="72" height="72" aria-hidden>
      <defs><radialGradient id={g} cx="35%" cy="30%" r="75%"><stop offset="0" stopColor="#cffafe" /><stop offset=".4" stopColor="#06b6d4" /><stop offset="1" stopColor="#1e3a8a" /></radialGradient></defs>
      <ellipse cx="40" cy="73" rx="22" ry="3.5" fill="#000" opacity=".45" />
      <circle cx="40" cy="38" r="28" fill={`url(#${g})`} />
      <g fill="none" stroke="#e0f2fe" strokeOpacity=".55" strokeWidth="1.3">
        <ellipse cx="40" cy="38" rx="12" ry="28" /><path d="M12 38h56M16 24h48M16 52h48" />
      </g>
      <ellipse cx="40" cy="38" rx="36" ry="10" fill="none" stroke="#a78bfa" strokeWidth="2" transform="rotate(-18 40 38)" className="ch3-orbit" />
      <text x="40" y="44" textAnchor="middle" fontSize="15" fontWeight="700" fill="#fff" fontFamily="Noto Sans Devanagari, Inter, sans-serif">अ</text>
    </svg>
  );
}

/* ---------- Hero extras: neural nodes, camera lens, sparks ---------- */

export function NeuralNodes() {
  const nodes = [[30, 40], [90, 20], [150, 52], [60, 110], [130, 120], [190, 96], [100, 70]];
  const links = [[0, 6], [1, 6], [2, 6], [3, 6], [4, 6], [5, 2], [5, 4], [0, 3], [1, 2]];
  return (
    <svg className="ch3-nodes" viewBox="0 0 220 150" aria-hidden>
      {links.map(([a, b], i) => (
        <line key={i} x1={nodes[a][0]} y1={nodes[a][1]} x2={nodes[b][0]} y2={nodes[b][1]} stroke="url(#ch3-link)" strokeWidth="1.4" className="ch3-link" style={{ animationDelay: `${i * 0.3}s` }} />
      ))}
      <defs><linearGradient id="ch3-link" x1="0" x2="1"><stop offset="0" stopColor="#22d3ee" /><stop offset="1" stopColor="#a78bfa" /></linearGradient></defs>
      {nodes.map(([x, y], i) => (
        <g key={i}><circle cx={x} cy={y} r={i === 6 ? 9 : 5} fill={i === 6 ? "#a78bfa" : "#22d3ee"} className="ch3-node" style={{ animationDelay: `${i * 0.4}s` }} />
          <circle cx={x} cy={y} r={i === 6 ? 16 : 10} fill="none" stroke={i === 6 ? "#a78bfa" : "#22d3ee"} strokeOpacity=".35" /></g>
      ))}
    </svg>
  );
}

export function CameraLens() {
  return (
    <div className="ch3-lens" aria-hidden>
      <span className="r1" /><span className="r2" /><span className="r3" /><span className="glass" /><span className="glint" />
    </div>
  );
}

export function Sparks({ n = 14 }: { n?: number }) {
  return (
    <div className="ch3-sparks" aria-hidden>
      {Array.from({ length: n }, (_, i) => (
        <i key={i} style={{ left: `${(i * 53) % 100}%`, top: `${(i * 37) % 100}%`, animationDelay: `${(i * 0.37) % 3}s`, background: i % 2 ? "#22d3ee" : "#c4b5fd" }} />
      ))}
    </div>
  );
}

/* ---------- Pro IDE pop-out widgets ---------- */

export function IdeWidgets() {
  return (
    <div className="ch3-widgets" aria-label="Pro tools inside the editor">
      <div className="ch3-w w1">
        <b>AI node graph</b>
        <svg viewBox="0 0 200 90" aria-hidden>
          {[["M38 30C70 30 70 60 100 60", 0], ["M38 60C70 60 70 30 100 30", 1], ["M132 45C150 45 150 45 166 45", 2]].map(([d, i]) => <path key={i as number} d={d as string} stroke="#a78bfa" strokeWidth="2" fill="none" className="ch3-link" />)}
          {[[10, 20, "Clip"], [10, 50, "Voice"], [100, 20, "Clean-up"], [100, 50, "Colour"], [166, 35, "Out"]].map(([x, y, t]) => (
            <g key={t as string}><rect x={x as number} y={y as number} width="30" height="20" rx="5" fill="#141329" stroke="#22d3ee" strokeOpacity=".6" /><text x={(x as number) + 15} y={(y as number) + 13} fontSize="6.5" textAnchor="middle" fill="#e2e8f0">{t}</text></g>
          ))}
        </svg>
      </div>
      <div className="ch3-w w2">
        <b>Colour wheels &amp; scopes</b>
        <div className="ch3-scopes">
          <ColorWheel3D />
          <svg viewBox="0 0 120 70" aria-hidden className="ch3-scope">
            {Array.from({ length: 40 }, (_, i) => <line key={i} x1={i * 3 + 1} x2={i * 3 + 1} y1={60} y2={60 - (12 + ((i * 29) % 40))} stroke={["#ef4444", "#22c55e", "#3b82f6"][i % 3]} strokeOpacity=".75" />)}
          </svg>
        </div>
      </div>
      <div className="ch3-w w3">
        <b>AI assistant</b>
        <p className="ch3-q">“Remove the pauses and add Hindi captions”</p>
        <p className="ch3-a">Done: 18 pauses cut, captions added on a new track. Undo any time.</p>
      </div>
    </div>
  );
}
