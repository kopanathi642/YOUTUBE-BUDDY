import { useState } from "react";
import { api, Asset } from "../api";

/** Resolve-style generators. The server draws each one as a PNG at the sequence size and adds it to the bin as an
 *  image, so it works with every effect, transition and animation, and the preview is the exported picture. */
type G = { type: string; label: string; colors: string[]; angle?: boolean; swatch: string };
const GENS: G[] = [
  { type: "solid", label: "Solid Color", colors: ["#7c3aed"], swatch: "#7c3aed" },
  { type: "gradient", label: "Gradient", colors: ["#7c3aed", "#22d3ee"], angle: true, swatch: "linear-gradient(90deg,#7c3aed,#22d3ee)" },
  { type: "fourcolor", label: "Four Color Gradient", colors: ["#7c3aed", "#22d3ee", "#f59e0b", "#ef4444"], swatch: "linear-gradient(135deg,#7c3aed,#22d3ee 40%,#f59e0b 60%,#ef4444)" },
  { type: "radial", label: "Radial Gradient", colors: ["#fde68a", "#7c2d12"], swatch: "radial-gradient(circle,#fde68a,#7c2d12)" },
  { type: "bars", label: "Color Bars", colors: [], swatch: "linear-gradient(90deg,#bfbfbf 0 14%,#bfbf00 0 28%,#00bfbf 0 42%,#00bf00 0 57%,#bf00bf 0 71%,#bf0000 0 85%,#0000bf 0)" },
  { type: "smpte", label: "SMPTE Bars", colors: [], swatch: "linear-gradient(90deg,#bfbfbf 0 14%,#bfbf00 0 28%,#00bfbf 0 42%,#00bf00 0 57%,#bf00bf 0 71%,#bf0000 0 85%,#0000bf 0)" },
  { type: "greyscale", label: "Grey Scale", colors: [], swatch: "linear-gradient(90deg,#000 0 9%,#1a1a1a 0 18%,#333 0 27%,#4d4d4d 0 36%,#666 0 45%,#808080 0 55%,#999 0 64%,#b3b3b3 0 73%,#ccc 0 82%,#e6e6e6 0 91%,#fff 0)" },
  { type: "grid", label: "Grid", colors: ["#1f2937", "#111827"], swatch: "repeating-conic-gradient(#1f2937 0 25%,#374151 0 50%) 0 0/14px 14px" },
  { type: "window", label: "Window (matte)", colors: ["#ffffff"], swatch: "radial-gradient(#fff 55%,#000 56%)" },
  { type: "speedlines", label: "Comic Speed Lines", colors: ["#111111", "#ffffff"], swatch: "repeating-conic-gradient(#111 0 3deg,#fff 3deg 9deg)" },
  { type: "paper", label: "Paper", colors: ["#eee6d6"], swatch: "#eee6d6" },
];
const NAMES = ["Colour", "Colour 2", "Colour 3", "Colour 4"];

export default function Generators({ projectId, size, onCreated, readOnly }: { projectId: string; size: { w: number; h: number }; onCreated: (a: Asset) => void; readOnly: boolean }) {
  const [pick, setPick] = useState<G | null>(null);
  const [cols, setCols] = useState<string[]>([]);
  const [angle, setAngle] = useState(90);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const choose = (g: G) => { setPick(g); setCols(g.colors); setErr(""); };
  async function make() {
    if (!pick) return;
    setBusy(true); setErr("");
    const body: Record<string, unknown> = { type: pick.type, width: size.w, height: size.h };
    ["color", "color2", "color3", "color4"].forEach((k, i) => { if (cols[i]) body[k] = cols[i]; });
    if (pick.angle) body.angle = angle;
    try { onCreated(await api<Asset>(`/projects/${projectId}/media/generate`, { method: "POST", body })); setPick(null); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }
  return (
    <div className="gen-panel">
      <div className="gen-grid" role="list" aria-label="Generators">
        {GENS.map((g) => <button key={g.type} role="listitem" className={`gen-tile ${pick?.type === g.type ? "on" : ""}`} onClick={() => choose(g)} disabled={readOnly}>
          <span className="gen-sw" style={{ background: g.swatch }} aria-hidden /><span>{g.label}</span></button>)}
      </div>
      {pick && <div className="gen-opts">
        {cols.map((c, i) => <label key={i} className="cslider"><span>{pick.type === "speedlines" ? ["Lines", "Background"][i] : NAMES[i]}</span>
          <input type="color" value={c} onChange={(e) => setCols(cols.map((x, j) => (j === i ? e.target.value : x)))} /></label>)}
        {pick.angle && <label className="cslider"><span>Angle</span><input type="range" min={0} max={360} value={angle} onChange={(e) => setAngle(+e.target.value)} /><span className="mono">{angle}°</span></label>}
        <button className="btn primary sm" onClick={make} disabled={busy || readOnly}>{busy ? "Creating…" : `Add ${pick.label} to media`}</button>
        <div className="dim" style={{ fontSize: 11 }}>Made at your sequence size ({size.w}×{size.h}). It appears in Media like a picture; drag it onto the timeline.</div>
        {err && <div className="err" role="alert">{err}</div>}
      </div>}
    </div>
  );
}
