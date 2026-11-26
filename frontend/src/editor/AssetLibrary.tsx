import { ReactNode, useMemo, useState } from "react";
import {
  Image as ImageIcon, AudioLines, Type, Sticker, Wand, ArrowLeftRight, Palette, SlidersHorizontal, Layers, Shapes, LayoutTemplate,
  Captions, Clapperboard, Droplets, Scan, PaintBucket, Sparkles, Brain, MousePointerClick, Lock, Play,
} from "lucide-react";
import { Asset } from "../api";
import { Clip, Timeline, Track, Title, len } from "../timeline";
import { EFFECTS, EFFECT_GROUPS, STYLES, ANIMATIONS, TEXT_STYLES, Effect, EffectType, animationKeys, applyAnimation, clampEffect, effectMeta } from "../effects";
import { TRANSITION_LIST, TransitionType, previousTouching } from "../transitions";
import { LOOKS, withLook, sanitizeGrade } from "../grade";
import { AUDIO_FX, AUDIO_GROUPS, VOICE_PRESETS, AudioFxType, audioMeta, clampAudio } from "../audiofx";
import { TITLE_TEMPLATES, TitleTemplate } from "../templates";
import type { Tool } from "../ai/core";
import type { Caps } from "./AiPanels";
import { SHORTS, VIDEO_TOOLS, AUDIO_TOOLS, MORE, Item } from "./ToolSidebar";
import { Film, Wrench, Rocket } from "lucide-react";

/** Categories of the Creative Assets Panel. Only categories with real, working content are listed (3D assets and a
 *  brand kit are not built yet, so they are not shown). */
export type AssetCat = "media" | "audio" | "text" | "stickers" | "effects" | "transitions" | "filters" | "adjustments" | "overlays" | "elements"
  | "templates" | "captions" | "motion" | "color" | "vfx" | "backgrounds" | "aitools" | "brain" | "shorts" | "tools";
export const CATEGORIES: { id: AssetCat; label: string; icon: any; hint: string }[] = [
  { id: "media", label: "Media", icon: ImageIcon, hint: "Your videos, images, stock footage and AI files" },
  { id: "audio", label: "Audio", icon: AudioLines, hint: "Music, voice-over, audio effects and voice presets" },
  { id: "text", label: "Text", icon: Type, hint: "Title templates, text styles and plain text" },
  { id: "stickers", label: "Stickers", icon: Sticker, hint: "Emoji-style stickers and social badges" },
  { id: "effects", label: "Effects", icon: Wand, hint: "Visual effects, glow, blur, distortion and one-click styles" },
  { id: "transitions", label: "Transitions", icon: ArrowLeftRight, hint: "Fades, dissolves, wipes, zooms and more" },
  { id: "filters", label: "Filters", icon: Palette, hint: "Cinematic looks and colour presets" },
  { id: "adjustments", label: "Adjust", icon: SlidersHorizontal, hint: "Brightness, contrast, saturation, exposure" },
  { id: "overlays", label: "Overlays", icon: Layers, hint: "Frames, film grain, light, bars and textures" },
  { id: "elements", label: "Elements", icon: Shapes, hint: "Shapes, arrows, icons and highlight graphics" },
  { id: "templates", label: "Templates", icon: LayoutTemplate, hint: "Ready-made titles, frames and elements" },
  { id: "captions", label: "Captions", icon: Captions, hint: "Auto captions, translation and subtitle styles" },
  { id: "motion", label: "Motion", icon: Clapperboard, hint: "In/out animations, lower thirds and kinetic text" },
  { id: "color", label: "Colour", icon: Droplets, hint: "Colour wheels, curves, LUTs and scopes" },
  { id: "vfx", label: "VFX", icon: Scan, hint: "Green screen, keys, background removal, compositing" },
  { id: "backgrounds", label: "Backgrounds", icon: PaintBucket, hint: "Solid colours, gradients and patterns" },
  { id: "shorts", label: "Shorts", icon: Film, hint: "Turn long videos into vertical Shorts and Reels" },
  { id: "tools", label: "Tools", icon: Wrench, hint: "Quick fixes: silence, scenes, stabilize, levels, captions, voice, export" },
  { id: "aitools", label: "AI Tools", icon: Sparkles, hint: "AI tools that work on your clips" },
  { id: "brain", label: "AI Brain", icon: Brain, hint: "Automatic editing, story and shot selection" },
];

export type AssetCtx = {
  tl: Timeline; sel: { track: Track; clip: Clip } | null; selAsset?: Asset; readOnly: boolean; fps: number;
  setClip: (patch: Partial<Clip>, key: string) => void;
  addTitle: (style?: Partial<Title>) => void;
  onTemplate: (t: TitleTemplate) => void;
  openTool: (id: string) => void;
  action: (id: string) => void;
  focus: (panel: "color" | "scopes" | "nodes" | "inspector") => void;
  tools: Tool[];
  hide: Set<string>;
  caps: Caps;
};

/* ------------------------------------------------------------------ shared pieces */

export function CategoryBar({ value, onChange }: { value: AssetCat; onChange: (c: AssetCat) => void }) {
  return (
    <nav className="ac-bar" aria-label="Asset categories">
      {CATEGORIES.map(({ id, label, icon: I, hint }) => (
        <button key={id} className={`ac-cat ${value === id ? "on" : ""}`} aria-pressed={value === id} title={hint} onClick={() => onChange(id)}>
          <I size={16} aria-hidden /><span>{label}</span>
        </button>
      ))}
    </nav>
  );
}

function Subs<T extends string>({ subs, value, onChange }: { subs: readonly T[]; value: T; onChange: (s: T) => void }) {
  if (subs.length < 2) return null;
  return <div className="ac-subs" role="tablist" aria-label="Subcategories">
    {subs.map((s) => <button key={s} role="tab" aria-selected={value === s} className={value === s ? "on" : ""} onClick={() => onChange(s)}>{s}</button>)}
  </div>;
}

/** One asset: preview, name and what kind of asset it is. */
function Card({ name, kind, preview, onClick, active, disabled, title }: {
  name: string; kind: string; preview: ReactNode; onClick: () => void; active?: boolean; disabled?: boolean; title?: string;
}) {
  return (
    <button className={`ac-card ${active ? "on" : ""}`} onClick={onClick} disabled={disabled} title={title ?? name} aria-pressed={active}>
      <span className="ac-prev">{preview}</span>
      <span className="ac-name ellipsis">{name}</span>
      <span className="ac-kind ellipsis">{kind}</span>
    </button>
  );
}

function Need({ children }: { children: ReactNode }) {
  return <div className="ac-need"><MousePointerClick size={13} aria-hidden />{children}</div>;
}

const SAMPLE = "linear-gradient(135deg,#f59e0b 0%,#ec4899 45%,#3b82f6 100%)";
const CSS_PREVIEW: Partial<Record<EffectType, string>> = {
  bw: "grayscale(1)", sepia: "sepia(.85)", hue: "hue-rotate(80deg)", invert: "invert(1)", boxblur: "blur(3px)", hblur: "blur(2px)", vblur: "blur(2px)",
  mosaic: "blur(1.5px) contrast(1.4)", glow: "brightness(1.25) saturate(1.2)", halation: "brightness(1.15) sepia(.25)", sharpen: "contrast(1.25)",
  contrastpop: "contrast(1.45)", posterize: "contrast(1.8) saturate(1.6)", falsecolor: "hue-rotate(200deg) saturate(2)", emboss: "grayscale(1) contrast(1.6)",
  edges: "invert(1) grayscale(1) contrast(2)", sketch: "grayscale(1) contrast(1.8) brightness(1.3)", denoise: "blur(.5px)",
};
function FxPreview({ type }: { type: EffectType }) {
  const extra = type === "vignette" ? "radial-gradient(circle, transparent 45%, rgba(0,0,0,.75) 100%)," : type === "letterbox" ? "linear-gradient(#000 0 18%, transparent 18% 82%, #000 82%)," :
    type === "scanlines" ? "repeating-linear-gradient(0deg, rgba(0,0,0,.35) 0 2px, transparent 2px 4px)," : type === "grain" ? "repeating-radial-gradient(circle at 30% 30%, rgba(255,255,255,.08) 0 1px, transparent 1px 3px)," : "";
  return <i className="ac-sample" style={{ background: extra + SAMPLE, filter: CSS_PREVIEW[type], transform: type === "flipv" ? "scaleY(-1)" : undefined }} />;
}

const useSub = <T extends string>(subs: readonly T[]) => useState<T>(subs[0]);

/* ------------------------------------------------------------------ categories */

const visualSel = (c: AssetCtx) => !!c.sel && c.sel.track.kind === "video" && !c.sel.track.locked && !c.sel.clip.title;
const anyVisualSel = (c: AssetCtx) => !!c.sel && c.sel.track.kind === "video" && !c.sel.track.locked;

function EffectCards({ c, types, kind }: { c: AssetCtx; types: EffectType[]; kind: string }) {
  const clip = c.sel?.clip, on = (t: EffectType) => !!clip?.effects?.some((e) => e.type === t);
  const ok = visualSel(c) && !c.readOnly;
  const toggle = (t: EffectType) => {
    if (!clip) return;
    const fx = clip.effects ?? [];
    c.setClip({ effects: on(t) ? fx.filter((e) => e.type !== t) : [...fx, { type: t, amount: effectMeta(t).def } as Effect] }, on(t) ? `fxdel:${t}` : `fxadd:${t}`);
  };
  return <div className="ac-grid">{types.map((t) => { const m = effectMeta(t);
    return <Card key={t} name={m.label} kind={`${kind} · ${m.group}`} preview={<FxPreview type={t} />} active={on(t)} disabled={!ok}
      title={`${m.hint}${on(t) ? " — click to remove" : ""}. Fine-tune strength in Inspector → Effects.`} onClick={() => toggle(t)} />; })}</div>;
}

function Effects({ c }: { c: AssetCtx }) {
  const subs = ["Styles", ...EFFECT_GROUPS.filter((g) => g !== "Key")] as const;
  const [sub, setSub] = useState<string>("Styles");
  return <>
    <Subs subs={subs as unknown as string[]} value={sub} onChange={setSub} />
    {!visualSel(c) && <Need>Select a video or image clip on the timeline to apply effects.</Need>}
    {sub === "Styles" ? <div className="ac-grid">
      {STYLES.map((st) => <Card key={st.name} name={st.name} kind="Style · colour + effects" disabled={!visualSel(c) || c.readOnly}
        preview={<i className="ac-sample" style={{ background: SAMPLE, filter: st.effects.map((e) => CSS_PREVIEW[e.type] ?? "").join(" ") || undefined }} />}
        onClick={() => c.sel && c.setClip({ effects: st.effects.map(clampEffect), color: st.grade ? withLook(st.grade) : c.sel.clip.color }, "style")} />)}
      <Card name="No effects" kind="Remove all" preview={<i className="ac-sample" style={{ background: SAMPLE }} />} disabled={!visualSel(c) || c.readOnly || !c.sel?.clip.effects?.length}
        onClick={() => c.setClip({ effects: null }, "nofx")} />
    </div> : <EffectCards c={c} kind="Effect" types={EFFECTS.filter((e) => e.group === sub).map((e) => e.type)} />}
  </>;
}

function Transitions({ c }: { c: AssetCtx }) {
  const groups = [...new Set(TRANSITION_LIST.map((t) => t.group))];
  const subs = ["Fades", ...groups];
  const [sub, setSub] = useState(subs[0]);
  const clip = c.sel?.clip, prev = c.sel && c.sel.track.kind === "video" ? previousTouching(c.sel.track, c.sel.clip) : undefined;
  const ro = c.readOnly || !c.sel || c.sel.track.locked;
  const setTr = (type: TransitionType | null) => clip && c.setClip({ transition_in: type ? { type, frames: clip.transition_in?.frames ?? Math.round(c.fps / 2) } : null }, "tr");
  const fade = (k: "fade_in" | "fade_out") => clip && c.setClip({ [k]: clip[k] ? 0 : Math.min(Math.round(c.fps / 2), Math.floor(len(clip) / 2)) } as Partial<Clip>, k);
  return <>
    <Subs subs={subs} value={sub} onChange={setSub} />
    {sub === "Fades" ? <>
      {!c.sel && <Need>Select a clip to fade its picture and sound.</Need>}
      <div className="ac-grid">
        <Card name="Fade in" kind="Fade · picture + sound" preview={<i className="tr-ico fade" />} active={!!clip?.fade_in} disabled={ro} onClick={() => fade("fade_in")} />
        <Card name="Fade out" kind="Fade · picture + sound" preview={<i className="tr-ico fade" style={{ transform: "scaleX(-1)" }} />} active={!!clip?.fade_out} disabled={ro} onClick={() => fade("fade_out")} />
      </div>
    </> : <>
      {!c.sel ? <Need>Select the clip that comes after the cut.</Need> : !prev && <Need>Place this clip right against the previous clip (no gap) to add a transition.</Need>}
      <div className="ac-grid">
        <Card name="Cut" kind="No transition" preview={<i className="tr-ico cut" />} active={!!prev && !clip?.transition_in} disabled={ro || !prev} onClick={() => setTr(null)} />
        {TRANSITION_LIST.filter((t) => t.group === sub).map((t) => <Card key={t.type} name={t.label} kind={`Transition · ${t.group}`} preview={<i className={`tr-ico ${t.type}`} />}
          active={clip?.transition_in?.type === t.type} disabled={ro || !prev} onClick={() => setTr(t.type)} title={`${t.label}: centred on the cut. Change its length in Inspector → Transition.`} />)}
      </div>
    </>}
  </>;
}

function Filters({ c }: { c: AssetCtx }) {
  const ok = visualSel(c) && !c.readOnly;
  const auto = c.selAsset?.analysis?.auto_grade;
  return <>
    {!visualSel(c) && <Need>Select a video or image clip, then pick a look.</Need>}
    <div className="ac-grid">
      {LOOKS.map((l, i) => <Card key={l.name} name={l.name} kind="Filter · colour look" preview={<span className="look-ph" style={{ filter: `url(#look-${i})` }} />} disabled={!ok}
        onClick={() => c.setClip({ color: withLook(l.grade) }, "look")} />)}
      {auto && <Card name="Auto colour" kind="Measured from your clip" preview={<i className="ac-sample" style={{ background: SAMPLE, filter: "contrast(1.1) saturate(1.1)" }} />} disabled={!ok}
        onClick={() => c.setClip({ color: sanitizeGrade(auto) }, "auto")} />}
      <Card name="None" kind="Remove filter" preview={<i className="ac-sample" style={{ background: SAMPLE }} />} disabled={!ok || !c.sel?.clip.color} onClick={() => c.setClip({ color: null }, "nolook")} />
    </div>
  </>;
}

function Overlays({ c, frames }: { c: AssetCtx; frames: ReactNode }) {
  const subs = ["Frames", "Film & light"] as const;
  const [sub, setSub] = useSub(subs);
  return <>
    <Subs subs={subs} value={sub} onChange={setSub} />
    {sub === "Frames" ? frames : <>
      {!visualSel(c) && <Need>Select a video or image clip to add film and light overlays.</Need>}
      <EffectCards c={c} kind="Overlay" types={["grain", "vignette", "scanlines", "glow", "halation", "letterbox", "rgbsplit"]} />
    </>}
  </>;
}

const TEXT_SUBS = ["Title templates", "Text styles", "Basic text"] as const;
function TextCat({ c }: { c: AssetCtx }) {
  const [sub, setSub] = useSub(TEXT_SUBS);
  const isTitle = !!c.sel?.clip.title && !c.sel.track.locked;
  const style = (patch: Partial<Title>) => isTitle && c.sel ? c.setClip({ title: { ...c.sel.clip.title!, ...patch } }, "tstyle") : c.addTitle(patch);
  return <>
    <Subs subs={TEXT_SUBS} value={sub} onChange={setSub} />
    {sub === "Title templates" && <div className="ac-grid">{TITLE_TEMPLATES.map((t) => <Card key={t.id} name={t.name} kind={`Title template · ${t.seconds}s`} disabled={c.readOnly}
      preview={<span className={`tpl-prev ${t.id}`}><b>{t.sample}</b></span>} title={`${t.desc} — added at the playhead`} onClick={() => c.onTemplate(t)} />)}</div>}
    {sub === "Text styles" && <>
      <Need>{isTitle ? "Click a style to restyle the selected text." : "Click a style to add new text at the playhead (or select a text clip to restyle it)."}</Need>
      <div className="ac-grid">{TEXT_STYLES.map((s) => <Card key={s.name} name={s.name} kind="Text style" disabled={c.readOnly} onClick={() => style(s.patch)}
        preview={<span className="ac-text" style={{ color: s.patch.color ?? "#fff", background: s.patch.bg_color ?? "transparent", WebkitTextStroke: s.patch.stroke ? `1px ${s.patch.stroke_color ?? "#000"}` : undefined }}>Abc</span>} />)}</div>
    </>}
    {sub === "Basic text" && <div className="ac-grid">
      <Card name="Heading" kind="Text" preview={<span className="ac-text" style={{ fontSize: 22, fontWeight: 900 }}>ABC</span>} disabled={c.readOnly} onClick={() => c.addTitle({ font_size: 150 })} />
      <Card name="Subheading" kind="Text" preview={<span className="ac-text" style={{ fontSize: 16, fontWeight: 700 }}>Abc</span>} disabled={c.readOnly} onClick={() => c.addTitle({ font_size: 90, bg_color: null })} />
      <Card name="Body text" kind="Text" preview={<span className="ac-text" style={{ fontSize: 12 }}>Abc def</span>} disabled={c.readOnly} onClick={() => c.addTitle({ font_size: 56, bg_color: null })} />
    </div>}
  </>;
}

const MOTION_SUBS = ["In", "Out", "Combo", "Animated titles", "AI motion"] as const;
function Motion({ c }: { c: AssetCtx }) {
  const [sub, setSub] = useSub(MOTION_SUBS);
  const clip = c.sel?.clip, ok = anyVisualSel(c) && !c.readOnly && !!clip && len(clip) >= 6;
  const kind = sub === "In" ? "in" : sub === "Out" ? "out" : "combo";
  return <>
    <Subs subs={MOTION_SUBS} value={sub} onChange={setSub} />
    {(sub === "In" || sub === "Out" || sub === "Combo") && <>
      {!anyVisualSel(c) && <Need>Select a clip, text or sticker on the timeline to animate it.</Need>}
      <div className="ac-grid">{ANIMATIONS.filter((a) => a.kind === kind).map((a) => <Card key={a.id + a.kind} name={a.label} kind={`Animation · ${sub}`} disabled={!ok}
        preview={<span className={`ac-anim ${a.id}`}><Play size={14} /></span>} title={`${a.label} — keyframes you can fine-tune in the Inspector`}
        onClick={() => clip && c.setClip({ keyframes: applyAnimation(clip, animationKeys(a.id, kind, clip, len(clip), c.fps, c.tl.width, c.tl.height)) }, `anim:${kind}:${a.id}`)} />)}</div>
    </>}
    {sub === "Animated titles" && <div className="ac-grid">{TITLE_TEMPLATES.map((t) => <Card key={t.id} name={t.name} kind="Motion title" disabled={c.readOnly}
      preview={<span className={`tpl-prev ${t.id}`}><b>{t.sample}</b></span>} onClick={() => c.onTemplate(t)} />)}</div>}
    {sub === "AI motion" && <ToolCards c={c} ids={["038", "039", "040"]} />}
  </>;
}

function AudioFx({ c }: { c: AssetCtx }) {
  const subs = ["Voice presets", ...AUDIO_GROUPS] as const;
  const [sub, setSub] = useState<string>("Voice presets");
  const clip = c.sel?.clip, ok = !!clip && !!clip.asset_id && !c.sel!.track.locked && !c.readOnly && (c.sel!.track.kind === "audio" || !!c.selAsset?.has_audio);
  const on = (t: AudioFxType) => !!clip?.audio_fx?.some((e) => e.type === t);
  return <>
    <Subs subs={subs as unknown as string[]} value={sub} onChange={setSub} />
    {!ok && <Need>Select a clip with sound on the timeline.</Need>}
    <div className="ac-grid">
      {sub === "Voice presets" ? <>{VOICE_PRESETS.map((p) => <Card key={p.name} name={p.name} kind="Voice preset" preview={<AudioLines size={22} />} disabled={!ok}
        onClick={() => c.setClip({ audio_fx: p.fx.map(clampAudio) }, "vpreset")} />)}
        <Card name="No audio FX" kind="Remove all" preview={<AudioLines size={22} className="dim" />} disabled={!ok || !clip?.audio_fx?.length} onClick={() => c.setClip({ audio_fx: null }, "noafx")} /></>
        : AUDIO_FX.filter((x) => x.group === sub).map((x) => <Card key={x.type} name={x.label} kind={`Audio effect${x.exportOnly ? " · export" : ""}`} preview={<AudioLines size={22} />} active={on(x.type)} disabled={!ok}
          title={`${x.hint}${x.exportOnly ? " (heard in the export)" : ""}`}
          onClick={() => clip && c.setClip({ audio_fx: on(x.type) ? (clip.audio_fx ?? []).filter((e) => e.type !== x.type) : [...(clip.audio_fx ?? []), { type: x.type, amount: audioMeta(x.type).def }] }, `afx:${x.type}`)} />)}
    </div>
  </>;
}

/** Cards for AI tools that run on footage. Only tools that work on this server are shown. */
export function ToolCards({ c, ids }: { c: AssetCtx; ids: string[] }) {
  const tools = ids.map((id) => c.tools.find((t) => t.id === id)).filter((t): t is Tool => !!t && t.status.state === "ready");
  if (!tools.length) return <div className="dim ac-empty">These AI tools aren't available on this server yet.</div>;
  return <div className="ac-grid">{tools.map((t) => <Card key={t.id} name={t.name} kind={t.status.gpu_offline ? "AI tool · waits for GPU" : "AI tool"} disabled={c.readOnly}
    preview={<Sparkles size={22} />} title={t.summary} onClick={() => c.openTool(t.id)} />)}</div>;
}

/** Which AI Generator tools work on clips in the editor. */
export const EDITOR_TOOLS: [string, string[]][] = [
  ["Fix footage", ["023", "022", "026", "027", "028", "029", "030", "024", "025", "021"]],
  ["Audio", ["047", "048", "049", "050", "041", "046", "045", "044", "042", "043"]],
  ["Captions & language", ["101", "102", "103", "104", "040", "107", "108", "110", "105", "106"]],
  ["Shorts & reframe", ["092", "094", "112", "114", "099", "096"]],
  ["Cut & organise", ["091", "093", "100", "065", "098", "097", "070"]],
  ["Analyse", ["061", "062", "064", "066", "067", "068"]],
];

function AiToolsCat({ c }: { c: AssetCtx }) {
  const subs = EDITOR_TOOLS.map(([g]) => g);
  const [sub, setSub] = useState(subs[0]);
  const locked = useMemo(() => EDITOR_TOOLS.flatMap(([, ids]) => ids).filter((id) => { const t = c.tools.find((x) => x.id === id); return t && t.status.state !== "ready"; }).length, [c.tools]);
  return <>
    <Subs subs={subs} value={sub} onChange={setSub} />
    <Need>Opens beside the timeline with your selected clip filled in. Results go straight onto the timeline.</Need>
    <ToolCards c={c} ids={EDITOR_TOOLS.find(([g]) => g === sub)![1]} />
    {locked > 0 && <div className="dim ac-empty"><Lock size={11} /> {locked} more AI tool{locked > 1 ? "s" : ""} need a server key or model and stay hidden until set up.</div>}
  </>;
}

function Captions_({ c }: { c: AssetCtx }) {
  return <>
    <div className="ac-grid">
      <Card name="Auto captions" kind="Speech → captions" preview={<Captions size={22} />} disabled={c.readOnly} onClick={() => c.action("subtitle")} title="Transcribe speech and put captions on the timeline (free, on our worker)" />
      <Card name="Transcript" kind="Speech → text" preview={<Type size={22} />} disabled={c.readOnly} onClick={() => c.action("transcribe")} />
      <Card name="Caption styles" kind="Text styles" preview={<span className="ac-text" style={{ color: "#ffe14d", WebkitTextStroke: "1px #000" }}>Abc</span>} disabled={c.readOnly}
        onClick={() => c.focus("inspector")} title="Select a caption on the Captions track, then restyle it in Text → Text styles" />
    </div>
    <div className="label ac-label">AI caption tools</div>
    <ToolCards c={c} ids={["040", "102", "103", "104", "110", "107", "108"]} />
  </>;
}

function ColorCat({ c }: { c: AssetCtx }) {
  return <>
    <div className="ac-grid">
      <Card name="Colour wheels & curves" kind="Colour page" preview={<Droplets size={22} />} onClick={() => c.focus("color")} title="Lift, gamma, gain, curves, HSL and LUTs for the selected clip" />
      <Card name="Scopes" kind="Waveform · histogram · vectorscope" preview={<SlidersHorizontal size={22} />} onClick={() => c.focus("scopes")} />
      <Card name="Node grading" kind="Nodes" preview={<Layers size={22} />} onClick={() => c.focus("nodes")} />
    </div>
    <div className="label ac-label">Colour presets</div>
    <Filters c={c} />
    <div className="label ac-label">AI colour</div>
    <ToolCards c={c} ids={["030"]} />
  </>;
}

function Vfx({ c }: { c: AssetCtx }) {
  const subs = ["Keying", "Compositing", "AI VFX"] as const;
  const [sub, setSub] = useSub(subs);
  return <>
    <Subs subs={subs} value={sub} onChange={setSub} />
    {sub === "Keying" && <>{!visualSel(c) && <Need>Select the clip with the green or blue background. Put your new background on the track below it.</Need>}
      <EffectCards c={c} kind="Key" types={["greenkey", "bluekey", "lumakey"]} /></>}
    {sub === "Compositing" && <div className="ac-grid">
      <Card name="Remove background" kind="People cut-out" preview={<Scan size={22} />} disabled={c.readOnly} onClick={() => c.action("bg")} title="Select a video clip first. Runs on our worker." />
      {!c.hide.has("obj") && <Card name="Remove object" kind="Mark and erase" preview={<Scan size={22} />} disabled={c.readOnly} onClick={() => c.action("obj")} />}
      <Card name="Stabilize" kind="Smooth shaky video" preview={<Scan size={22} />} disabled={c.readOnly} onClick={() => c.action("stabilize")} />
      <Card name="Node compositing" kind="Nodes" preview={<Layers size={22} />} onClick={() => c.focus("nodes")} />
    </div>}
    {sub === "AI VFX" && <ToolCards c={c} ids={["022", "023", "028", "026", "098", "024", "025", "021"]} />}
  </>;
}

function Brain_({ c }: { c: AssetCtx }) {
  return <>
    <div className="ac-grid">
      <Card name="Auto-edit my video" kind="AI Editor Brain" preview={<Brain size={22} />} disabled={c.readOnly} onClick={() => c.action("autoedit")}
        title="Describe the feeling you want; get an editable cut with music, colour and titles" />
      <Card name="Make a 30-second ad" kind="Director" preview={<Clapperboard size={22} />} disabled={c.readOnly} onClick={() => c.action("assistant")} />
      <Card name="Fix my edit" kind="Smart plan" preview={<Sparkles size={22} />} disabled={c.readOnly} onClick={() => c.action("magic")}
        title="Checks silences, colour, loudness and noise on this timeline and fixes them in one go" />
    </div>
    <div className="label ac-label">AI editing tools</div>
    <ToolCards c={c} ids={["121", "094", "112", "091", "093", "065"]} />
  </>;
}

/** The editor's built-in one-click tools (what used to be the left tool rail). Unavailable ones are hidden. */
function QuickTools({ c, groups }: { c: AssetCtx; groups: [string, Item[]][] }) {
  const usable = (it: Item) => { const cp = it.cap ? c.caps.get(it.cap) : null; return !(c.hide.has(it.id) || it.soon || (cp && !cp.ready)); };
  const live = groups.map(([g, items]) => [g, items.filter(usable)] as [string, Item[]]).filter(([, items]) => items.length);
  const [pick, setSub] = useState("");
  const sub = live.some(([g]) => g === pick) ? pick : live[0]?.[0] ?? "";
  const items = live.find(([g]) => g === sub)?.[1] ?? [];
  if (!live.length) return <div className="dim ac-empty">These tools aren't available on this server yet.</div>;
  return <>
    <Subs subs={live.map(([g]) => g)} value={sub} onChange={setSub} />
    <div className="ac-grid">{items.map((it) => <Card key={it.id} name={it.label} kind={sub} preview={<it.icon size={22} />}
      disabled={c.readOnly && !["color", "fusion", "export", "effects", "transitions"].includes(it.id)} onClick={() => c.action(it.id)} />)}</div>
  </>;
}
const TOOL_GROUPS: [string, Item[]][] = [
  ["Video", VIDEO_TOOLS],
  ["Audio", AUDIO_TOOLS],
  ["Text & voice", MORE.filter((i) => ["subtitle", "voice", "tts", "lipsync", "transcribe"].includes(i.id))],
  ["Design", MORE.filter((i) => ["design", "stock"].includes(i.id))],
  ["Finish & export", [...MORE.filter((i) => ["color", "fusion", "export"].includes(i.id)), { id: "magic", label: "AI Magic (fix my edit)", icon: Sparkles }, { id: "export", label: "Export & Share", icon: Rocket }].filter((x, i, a) => a.findIndex((y) => y.id === x.id) === i)],
];

/** Content for the categories that aren't plain media lists. */
export function AssetCategoryView({ cat, c, frames, stickers, elements, templates, adjustments, backgrounds }: {
  cat: AssetCat; c: AssetCtx; frames: ReactNode; stickers: ReactNode; elements: ReactNode; templates: ReactNode; adjustments: ReactNode; backgrounds: ReactNode;
}) {
  const body = (() => {
    switch (cat) {
      case "text": return <TextCat c={c} />;
      case "stickers": return stickers;
      case "effects": return <Effects c={c} />;
      case "transitions": return <Transitions c={c} />;
      case "filters": return <Filters c={c} />;
      case "adjustments": return adjustments;
      case "overlays": return <Overlays c={c} frames={frames} />;
      case "elements": return elements;
      case "templates": return templates;
      case "captions": return <Captions_ c={c} />;
      case "motion": return <Motion c={c} />;
      case "color": return <ColorCat c={c} />;
      case "vfx": return <Vfx c={c} />;
      case "backgrounds": return backgrounds;
      case "shorts": return <QuickTools c={c} groups={[["Shorts", SHORTS]]} />;
      case "tools": return <QuickTools c={c} groups={TOOL_GROUPS} />;
      case "aitools": return <AiToolsCat c={c} />;
      case "brain": return <Brain_ c={c} />;
      default: return null;
    }
  })();
  return <div className="bin-list ac-body">{body}</div>;
}

export { AudioFx };
