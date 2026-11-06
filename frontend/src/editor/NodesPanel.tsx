import { Workflow } from "lucide-react";
import { Asset } from "../api";
import { Clip, Timeline, Track, updateClip } from "../timeline";
import { NEUTRAL, isNeutral } from "../grade";

type Sel = { track: Track; clip: Clip } | null;

/** Node view of the selected clip's real render pipeline (the same chain the FFmpeg compiler builds).
 *  Nodes can be bypassed; free-form node editing is planned. */
export default function NodesPanel({ tl, sel, asset, edit, readOnly }: { tl: Timeline; sel: Sel; asset?: Asset; edit: (t: Timeline | null, c?: string) => boolean; readOnly: boolean }) {
  const visual = sel && sel.track.kind === "video" && asset?.has_video;
  const c = sel?.clip;
  const tfOn = !!c && (c.transform.x || c.transform.y || c.transform.scale !== 1 || c.transform.rotation || c.transform.opacity < 1);
  const ccOn = !!c && !!c.color && !isNeutral({ ...c.color, enabled: true }); // a bypassed grade still exists
  const fadeOn = !!c && (c.fade_in > 0 || c.fade_out > 0);
  const nodes = [
    { id: "in", label: "MediaIn1", x: 8, y: 22, on: true, tip: asset ? `${asset.filename} (original file)` : "" },
    { id: "tf", label: "Transform1", x: 8, y: 78, on: tfOn, tip: c ? `x ${c.transform.x}, y ${c.transform.y}, scale ${Math.round(c.transform.scale * 100)}%, rot ${c.transform.rotation}°` : "" },
    { id: "cc", label: "ColorCorrect1", x: 128, y: 22, on: ccOn, tip: ccOn ? "Primary grade (lift/gamma/gain/offset, tone)" : "Neutral", bypass: c?.color && !c.color.enabled },
    { id: "fd", label: "Fade1", x: 128, y: 78, on: fadeOn, tip: c ? `in ${c.fade_in}f · out ${c.fade_out}f` : "" },
    { id: "mg", label: "Merge1", x: 248, y: 50, on: true, tip: `Over tracks below (opacity ${c ? Math.round(c.transform.opacity * 100) : 100}%)` },
    { id: "out", label: "MediaOut1", x: 342, y: 50, on: true, tip: "Program output" },
  ];
  const pos = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const edges = [["in", "cc"], ["cc", "tf"], ["tf", "fd"], ["fd", "mg"], ["mg", "out"]];
  return (
    <section className="panel strip-panel" aria-label="Fusion nodes">
      <div className="strip-head"><Workflow size={15} /><b>Fusion Nodes (VFX)</b><span className="dim" style={{ fontSize: 11, marginLeft: 6 }}>this clip's real render chain</span></div>
      {!visual ? <div className="strip-empty">Select a video clip to see its node chain. Free-form node compositing is planned.</div> : (
        <div className="nodes">
          <svg className="edges" viewBox="0 0 440 120" preserveAspectRatio="none" aria-hidden>
            {edges.map(([a, b]) => { const A = pos[a], B = pos[b]; return <path key={a + b} d={`M${A.x + 96} ${A.y + 11} C ${A.x + 130} ${A.y + 11}, ${B.x - 30} ${B.y + 11}, ${B.x} ${B.y + 11}`} />; })}
          </svg>
          {nodes.map((n) => (
            <button key={n.id} className={`node ${n.on ? "on" : ""} ${n.bypass ? "bypass" : ""}`} style={{ left: `${(n.x / 440) * 100}%`, top: n.y }} title={n.tip}
              disabled={n.id !== "cc" || !ccOn || readOnly}
              onClick={() => c && n.id === "cc" && edit(updateClip(tl, c.id, { color: { ...(c.color ?? NEUTRAL), enabled: !(c.color?.enabled ?? true) } }))}>
              {n.label}{n.bypass && <small> (bypassed)</small>}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
