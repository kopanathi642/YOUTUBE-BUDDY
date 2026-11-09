import { useState } from "react";
import { AlignHorizontalJustifyCenter, AlignVerticalJustifyCenter, AlignStartVertical, AlignEndVertical, AlignStartHorizontal, AlignEndHorizontal, RotateCcw, Diamond, ChevronDown } from "lucide-react";
import { Anim, AnimIn, AnimOut, DEFAULT_ANIM, Layer, MediaLayer, TextLayer, AudioLayer } from "../compose";
import type { Keyframe } from "../keyframes";
import type { Ctx } from "./ShortsStudio";
import { footprint } from "./Canvas";

const pct = (v: number) => Math.round(v * 1000) / 10;

function Num({ label, value, min, max, step = 1, unit = "", onChange, k }: { label: string; value: number; min: number; max: number; step?: number; unit?: string;
  onChange: (v: number) => void; k?: string }) {
  return <label className="sts-f" data-k={k}><span>{label}</span>
    <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} aria-label={label} />
    <input type="number" className="sts-n" min={min} max={max} step={step} value={+(Math.round(value / step) * step).toFixed(step < 1 ? String(step).split(".")[1]?.length ?? 2 : 0)} onChange={(e) => onChange(Math.max(min, Math.min(max, +e.target.value || 0)))} aria-label={`${label} value`} />
    <i>{unit}</i></label>;
}

function Section({ title, children, open: o = true }: { title: string; children: React.ReactNode; open?: boolean }) {
  const [open, setOpen] = useState(o);
  return <section className="sts-sec"><button className="sts-sec-h" onClick={() => setOpen(!open)} aria-expanded={open}>{title}<ChevronDown size={14} style={{ transform: open ? "none" : "rotate(-90deg)" }} /></button>
    {open && <div className="sts-sec-b">{children}</div>}</section>;
}

export default function LayerInspector({ ctx }: { ctx: Ctx }) {
  const { comp } = ctx;
  const L = comp.layers.find((l) => l.id === ctx.selected) ?? null;
  const fps = comp.fps;
  if (!L) return <aside className="sts-insp" aria-label="Inspector">
    <div className="sts-ph"><b>Composition</b></div>
    <div className="sts-kv"><span>Canvas</span><b>{comp.width}×{comp.height}</b></div>
    <div className="sts-kv"><span>Layers</span><b>{comp.layers.length}</b></div>
    <Num label="Length" value={+(comp.duration / fps).toFixed(1)} min={1} max={180} step={0.5} unit="s" onChange={(v) => ctx.edit({ ...comp, duration: Math.max(1, Math.round(v * fps)) }, "dur")} />
    <p className="dim sm">Click a layer on the canvas or in the layer list to edit it. Videos shorter than this length end early.</p>
  </aside>;

  const set = (patch: Partial<Layer>, key = "insp") => ctx.edit({ ...comp, layers: comp.layers.map((l) => (l.id === L.id ? { ...l, ...patch } as Layer : l)) }, `${key}:${L.id}`);
  const lock = L.locked;
  const anim = L.anim ?? DEFAULT_ANIM;
  const setAnim = (a: Partial<Anim>) => set({ anim: { ...anim, ...a } }, "anim");
  const local = ctx.playhead - L.start;

  const timing = <Section title="Timing">
    <Num label="Starts at" value={+(L.start / fps).toFixed(2)} min={0} max={Math.max(0, comp.duration / fps - 0.1)} step={0.1} unit="s" onChange={(v) => set({ start: Math.round(v * fps) }, "start")} />
    <Num label="Length" value={+(((L.length ?? comp.duration - L.start)) / fps).toFixed(2)} min={0.1} max={comp.duration / fps} step={0.1} unit="s" onChange={(v) => set({ length: Math.max(1, Math.round(v * fps)) }, "len")} />
    {L.length != null && <button className="btn sm ghost" onClick={() => set({ length: null })}>Until the end</button>}
    {(L.kind === "media" || L.kind === "audio") && <Num label="Clip starts from" value={+(L.in / fps).toFixed(2)} min={0} max={Math.max(0, ((ctx.amap.get(L.asset_id ?? "")?.duration_s ?? 0) - 0.1))} step={0.1} unit="s"
      onChange={(v) => set({ in: Math.round(v * fps) } as any, "in")} />}
  </Section>;

  if (L.kind === "audio") {
    const A = L as AudioLayer;
    return <aside className="sts-insp" aria-label="Inspector">
      <div className="sts-ph"><b>{A.name}</b><span className="dim sm">audio</span></div>
      <Num label="Volume" value={Math.round(A.volume * 100)} min={0} max={200} unit="%" onChange={(v) => set({ volume: v / 100 } as any, "vol")} />
      {timing}
    </aside>;
  }

  const fp = footprint(L, ctx)!;
  const box = L.box;
  const setBox = (b: Partial<typeof box>, key = "box") => set({ box: { ...box, ...b }, pinned: true }, key);
  const align = (where: string) => {
    const hw = fp.w / 2, hh = fp.h / 2;
    const m: Record<string, Partial<typeof box>> = { left: { x: hw }, hcenter: { x: 0.5 }, right: { x: 1 - hw }, top: { y: hh }, vcenter: { y: 0.5 }, bottom: { y: 1 - hh } };
    setBox(m[where], "align");
  };
  const kfAdd = () => {
    if (local < 0 || local >= (L.length ?? comp.duration - L.start)) return;
    const put = (arr: Keyframe[] | undefined, v: number) => [...(arr ?? []).filter((k) => k.t !== local), { t: local, v, ease: "ease" as const }].sort((a, b) => a.t - b.t);
    set({ kf: { x: put(L.kf?.x, box.x), y: put(L.kf?.y, box.y), scale: put(L.kf?.scale, 1) } }, "kf");
  };
  const nKf = Math.max(L.kf?.x?.length ?? 0, L.kf?.y?.length ?? 0);

  return <aside className="sts-insp" aria-label="Inspector">
    <div className="sts-ph"><input className="sts-name" value={L.name} onChange={(e) => set({ name: e.target.value.slice(0, 60) }, "name")} aria-label="Layer name" />
      <span className="dim sm">{L.kind === "text" ? "text" : (L as MediaLayer).graphic ? "graphic" : ctx.amap.get((L as MediaLayer).asset_id ?? "")?.kind ?? "media"}</span></div>
    {lock && <div className="sts-note">Locked — unlock it in the layer list to edit.</div>}
    <fieldset disabled={lock} className="sts-fs">
      {L.kind === "text" && <TextProps L={L} set={set} />}
      <Section title="Position & size">
        <div className="sts-align" role="group" aria-label="Align">
          <button className="btn icon ghost sm" title="Align left" aria-label="Align left" onClick={() => align("left")}><AlignStartVertical size={15} /></button>
          <button className="btn icon ghost sm" title="Centre horizontally" aria-label="Centre horizontally" onClick={() => align("hcenter")}><AlignHorizontalJustifyCenter size={15} /></button>
          <button className="btn icon ghost sm" title="Align right" aria-label="Align right" onClick={() => align("right")}><AlignEndVertical size={15} /></button>
          <button className="btn icon ghost sm" title="Align top" aria-label="Align top" onClick={() => align("top")}><AlignStartHorizontal size={15} /></button>
          <button className="btn icon ghost sm" title="Centre vertically" aria-label="Centre vertically" onClick={() => align("vcenter")}><AlignVerticalJustifyCenter size={15} /></button>
          <button className="btn icon ghost sm" title="Align bottom" aria-label="Align bottom" onClick={() => align("bottom")}><AlignEndHorizontal size={15} /></button>
          <button className="btn icon ghost sm" title="Reset position" aria-label="Reset position" onClick={() => set({ box: { ...box, x: 0.5, y: 0.5 }, rotation: 0, pinned: false }, "reset")}><RotateCcw size={15} /></button>
        </div>
        <Num k="x" label="X (centre)" value={pct(box.x)} min={-50} max={150} step={0.5} unit="%" onChange={(v) => setBox({ x: v / 100 })} />
        <Num k="y" label="Y (centre)" value={pct(box.y)} min={-50} max={150} step={0.5} unit="%" onChange={(v) => setBox({ y: v / 100 })} />
        <Num label={L.kind === "text" ? "Max width" : "Width"} value={pct(box.w)} min={2} max={300} step={0.5} unit="%" onChange={(v) => setBox({ w: v / 100 })} />
        {L.kind === "media" && <Num label="Height" value={pct(box.h)} min={2} max={300} step={0.5} unit="%" onChange={(v) => setBox({ h: v / 100 })} />}
        {L.kind === "media" && <div className="sts-row"><span className="dim sm">Scale</span>
          {[0.8, 0.9, 1.1, 1.25].map((k) => <button key={k} className="btn sm" onClick={() => setBox({ w: box.w * k, h: box.h * k }, "scale")}>{k < 1 ? "−" : "+"}{Math.round(Math.abs(k - 1) * 100)}%</button>)}</div>}
        <Num label="Rotation" value={L.rotation} min={-180} max={180} unit="°" onChange={(v) => set({ rotation: v }, "rot")} />
        <Num label="Opacity" value={Math.round(L.opacity * 100)} min={0} max={100} unit="%" onChange={(v) => set({ opacity: v / 100 }, "op")} />
        <div className="sts-row">
          <button className="btn sm" onClick={kfAdd} title="Keyframe the position at the playhead; add another at a different time to animate"><Diamond size={12} />Keyframe position</button>
          {nKf > 0 && <button className="btn sm ghost" onClick={() => set({ kf: undefined }, "kf")}>Clear {nKf}</button>}
        </div>
        {nKf === 1 && <p className="dim sm">Move the playhead, change the position, and add a second keyframe to animate.</p>}
      </Section>
      {L.kind === "media" && <MediaProps L={L} set={set} ctx={ctx} />}
      <Section title="Animation" open={false}>
        <label className="sts-f"><span>Entrance</span><select value={anim.in} onChange={(e) => setAnim({ in: e.target.value as AnimIn })}>
          {["none", "fade", "slide-up", "slide-down", "slide-left", "slide-right", "zoom-in", "pop"].map((a) => <option key={a}>{a}</option>)}</select></label>
        <label className="sts-f"><span>Exit</span><select value={anim.out} onChange={(e) => setAnim({ out: e.target.value as AnimOut })}>
          {["none", "fade", "slide-up", "slide-down", "zoom-out"].map((a) => <option key={a}>{a}</option>)}</select></label>
        <Num label="Duration" value={anim.frames} min={2} max={90} unit="fr" onChange={(v) => setAnim({ frames: v })} />
        {L.kind === "media" && <Num label="Slow zoom" value={Math.round((anim.kenburns ?? 0) * 100)} min={0} max={50} unit="%" onChange={(v) => setAnim({ kenburns: v / 100 })} />}
      </Section>
      {timing}
    </fieldset>
  </aside>;
}

function TextProps({ L, set }: { L: TextLayer; set: (p: Partial<TextLayer>, k?: string) => void }) {
  return <Section title="Text">
    <textarea className="input sts-ta" rows={3} value={L.text} maxLength={300} onChange={(e) => set({ text: e.target.value }, "text")} aria-label="Text" />
    <Num label="Size" value={Math.round(L.size * 1000) / 10} min={1} max={37} step={0.1} unit="%" onChange={(v) => set({ size: v / 100 }, "size")} />
    <div className="sts-row">
      <label className="sts-c">Colour<input type="color" value={L.color} onChange={(e) => set({ color: e.target.value }, "color")} /></label>
      <label className="sts-c">Outline<input type="color" value={L.stroke_color} onChange={(e) => set({ stroke_color: e.target.value }, "sc")} /></label>
      <label className="sts-c"><input type="checkbox" checked={!!L.bg_color} onChange={(e) => set({ bg_color: e.target.checked ? "#000000" : null })} />Box
        {L.bg_color && <input type="color" value={L.bg_color} onChange={(e) => set({ bg_color: e.target.value }, "bg")} />}</label>
    </div>
    <div className="sts-seg" role="group" aria-label="Alignment">{(["left", "center", "right"] as const).map((a) => <button key={a} className={L.align === a ? "on" : ""} onClick={() => set({ align: a })}>{a}</button>)}</div>
    <Num label="Outline" value={Math.round(L.stroke * 100)} min={0} max={20} unit="%" onChange={(v) => set({ stroke: v / 100 }, "stroke")} />
    <Num label="Shadow" value={Math.round(L.shadow * 100)} min={0} max={100} unit="%" onChange={(v) => set({ shadow: v / 100 }, "shadow")} />
    {L.bg_color && <Num label="Box opacity" value={Math.round(L.bg_opacity * 100)} min={0} max={100} unit="%" onChange={(v) => set({ bg_opacity: v / 100 }, "bgo")} />}
  </Section>;
}

function MediaProps({ L, set, ctx }: { L: MediaLayer; set: (p: Partial<MediaLayer>, k?: string) => void; ctx: Ctx }) {
  const fx = L.fx ?? {};
  const setFx = (p: Partial<NonNullable<MediaLayer["fx"]>>, k: string) => set({ fx: { ...fx, ...p } }, `fx-${k}`);
  const a = L.asset_id ? ctx.amap.get(L.asset_id) : undefined;
  return <>
    <Section title="Framing">
      <div className="sts-seg" role="group" aria-label="Fit">
        <button className={L.fit === "cover" ? "on" : ""} onClick={() => set({ fit: "cover" })} title="Fill the frame (crops the edges, never stretches)">Fill frame</button>
        <button className={L.fit === "contain" ? "on" : ""} onClick={() => set({ fit: "contain" })} title="Show the whole picture">Whole picture</button></div>
      <Num label="Zoom" value={Math.round(L.zoom * 100)} min={100} max={600} unit="%" onChange={(v) => set({ zoom: v / 100 }, "zoom")} />
      <Num label="Focus ↔" value={Math.round(L.focus.x * 100)} min={0} max={100} unit="%" onChange={(v) => set({ focus: { ...L.focus, x: v / 100 } }, "fx")} />
      <Num label="Focus ↕" value={Math.round(L.focus.y * 100)} min={0} max={100} unit="%" onChange={(v) => set({ focus: { ...L.focus, y: v / 100 } }, "fy")} />
      {a?.analysis?.subject_center_x != null && <button className="btn sm ghost" onClick={() => set({ focus: { x: a.analysis!.subject_center_x!, y: a.analysis!.subject_center_y ?? 0.45 } })}>Focus on the detected face</button>}
      {a?.has_audio && <Num label="Volume" value={Math.round(L.volume * 100)} min={0} max={200} unit="%" onChange={(v) => set({ volume: v / 100 }, "vol")} />}
    </Section>
    <Section title="Effects">
      <Num label="Blur" value={Math.round((fx.blur ?? 0) * 1000) / 10} min={0} max={10} step={0.1} unit="%" onChange={(v) => setFx({ blur: v / 100 }, "blur")} />
      <Num label="Brightness" value={Math.round((fx.brightness ?? 0) * 100)} min={-100} max={100} unit="" onChange={(v) => setFx({ brightness: v / 100 }, "br")} />
      <Num label="Contrast" value={Math.round((fx.contrast ?? 1) * 100)} min={0} max={200} unit="%" onChange={(v) => setFx({ contrast: v / 100 }, "ct")} />
      <Num label="Saturation" value={Math.round((fx.saturation ?? 1) * 100)} min={0} max={200} unit="%" onChange={(v) => setFx({ saturation: v / 100 }, "sat")} />
      <Num label="Corners" value={Math.round((fx.radius ?? 0) * 1000) / 10} min={0} max={30} step={0.1} unit="%" onChange={(v) => setFx({ radius: v / 100 }, "rad")} />
      <Num label="Border" value={Math.round((fx.border ?? 0) * 1000) / 10} min={0} max={5} step={0.1} unit="%" onChange={(v) => setFx({ border: v / 100 }, "bd")} />
      {!!fx.border && <label className="sts-c">Border colour<input type="color" value={fx.border_color ?? "#ffffff"} onChange={(e) => setFx({ border_color: e.target.value }, "bdc")} /></label>}
      <Num label="Shadow" value={Math.round((fx.shadow ?? 0) * 1000) / 10} min={0} max={8} step={0.1} unit="%" onChange={(v) => setFx({ shadow: v / 100 }, "sh")} />
      {!!fx.shadow && <Num label="Shadow strength" value={Math.round((fx.shadow_opacity ?? 0.6) * 100)} min={0} max={100} unit="%" onChange={(v) => setFx({ shadow_opacity: v / 100 }, "sho")} />}
      <label className="sts-c"><input type="checkbox" checked={!!fx.flip_h} onChange={(e) => setFx({ flip_h: e.target.checked }, "flip")} />Mirror</label>
    </Section>
  </>;
}
