import { useEffect, useMemo, useState } from "react";
import { Film, LayoutGrid, LayoutTemplate, Type, Shapes, Wand2, Image as ImageIcon, Sparkles, Plus, Star, Copy, Trash2, Search, Save, Music } from "lucide-react";
import { api } from "../api";
import { useAuth, useToast } from "../App";
import { AssetLike, CATEGORIES, Composition, Graphic, Layer, MediaLayer, STYLES, StyleParams, TEMPLATES, Template, TextLayer, applyTemplate, aspectOf, buildStyle,
  fitDuration, fromTemplateData, graphicLayer, lid, mediaLayer, suggestLayouts, textLayer, toTemplateData, DEFAULT_ANIM } from "../compose";
import type { Ctx } from "./ShortsStudio";
import { UploadButton } from "./ShortsStudio";

export type SideTab = "media" | "layouts" | "templates" | "text" | "graphics" | "effects" | "backgrounds" | "ai";
const TABS: { id: SideTab; label: string; icon: any }[] = [
  { id: "media", label: "Media", icon: Film }, { id: "layouts", label: "Layouts", icon: LayoutGrid }, { id: "templates", label: "Templates", icon: LayoutTemplate },
  { id: "text", label: "Text", icon: Type }, { id: "graphics", label: "Graphics", icon: Shapes }, { id: "effects", label: "Effects", icon: Wand2 },
  { id: "backgrounds", label: "Backgrounds", icon: ImageIcon }, { id: "ai", label: "AI Assistant", icon: Sparkles },
];

/** Media in the composition (main first, then panels, picture-in-picture and media the creator added), used when re-laying out. */
export function mediaOf(c: Composition, amap: Map<string, AssetLike>) {
  const order = (l: Layer) => (l.role === "main" ? 0 : l.role.startsWith("panel") ? 1 + +l.role.slice(6) : l.role === "pip" ? 20 : l.role === "custom" ? 30 : 99);
  const ids: string[] = [];
  for (const l of [...c.layers].sort((a, b) => order(a) - order(b)))
    if (l.kind === "media" && !l.graphic && l.asset_id && order(l) < 99 && !ids.includes(l.asset_id)) ids.push(l.asset_id);
  const all = ids.map((i) => amap.get(i)).filter(Boolean) as AssetLike[];
  return { videos: all.filter((a) => a.kind === "video"), images: all.filter((a) => a.kind === "image") };
}

export default function Sidebar({ ctx, tab, setTab }: { ctx: Ctx; tab: SideTab; setTab: (t: SideTab) => void }) {
  return <aside className="sts-side">
    <nav className="sts-rail" aria-label="Studio tools">{TABS.map((t) => <button key={t.id} className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)} aria-pressed={tab === t.id}>
      <t.icon size={18} /><span>{t.label}</span></button>)}</nav>
    <div className="sts-panel" role="region" aria-label={TABS.find((t) => t.id === tab)!.label}>
      {tab === "media" && <MediaTab ctx={ctx} />}
      {tab === "layouts" && <LayoutsTab ctx={ctx} />}
      {tab === "templates" && <TemplatesTab ctx={ctx} />}
      {tab === "text" && <TextTab ctx={ctx} />}
      {tab === "graphics" && <GraphicsTab ctx={ctx} />}
      {tab === "effects" && <EffectsTab ctx={ctx} />}
      {tab === "backgrounds" && <BackgroundsTab ctx={ctx} />}
      {tab === "ai" && <AiTab ctx={ctx} />}
    </div>
  </aside>;
}

const add = (ctx: Ctx, L: Layer, under = false) => {
  const layers = under ? [L, ...ctx.comp.layers] : [...ctx.comp.layers, L];
  ctx.edit({ ...ctx.comp, layers }); ctx.select(L.id);
};

function MediaTab({ ctx }: { ctx: Ctx }) {
  const items = ctx.assets.filter((a) => !(a as any).analysis?.generation?.source?.startsWith("studio.") && ["video", "image", "audio"].includes(a.kind));
  const sel = ctx.comp.layers.find((l) => l.id === ctx.selected);
  return <>
    <div className="sts-ph"><b>Media</b><UploadButton projectId={ctx.projectId} onDone={ctx.reloadMedia} /></div>
    <p className="dim sm">Click to add as a new layer{sel && sel.kind === "media" ? " · or replace the selected layer’s media" : ""}.</p>
    <div className="sts-grid">{items.map((a) => <div key={a.id} className={`sts-asset ${a.status !== "ready" ? "busy" : ""}`}>
      {a.thumbnail_url ? <img src={a.thumbnail_url} alt="" /> : <span className="sts-ak">{a.kind === "audio" ? <Music size={22} /> : a.kind}</span>}
      <em title={a.filename}>{a.filename}</em>
      {a.status !== "ready" ? <small>{a.status}…</small> : <div className="sts-asset-b">
        <button className="btn sm" onClick={() => {
          const W = ctx.comp.width, H = ctx.comp.height;
          if (a.kind === "audio") return add(ctx, { id: lid(), kind: "audio", role: "custom", name: a.filename.slice(0, 40), asset_id: a.id, in: 0, volume: 1, opacity: 1, rotation: 0, start: 0, length: null });
          const ar = aspectOf(a as AssetLike), w = 0.6, h = Math.min(0.9, (w * W / ar) / H);
          add(ctx, mediaLayer("custom", a.filename.slice(0, 40), a as AssetLike, { x: 0.5, y: 0.5, w: Math.min(w, h * H * ar / W), h }, { fit: "contain", volume: a.has_audio ? 1 : 0 }));
        }}><Plus size={12} />Add</button>
        {sel && sel.kind === "media" && a.kind !== "audio" && <button className="btn sm ghost" onClick={() => ctx.edit({ ...ctx.comp, layers: ctx.comp.layers.map((l) => (l.id === sel.id ? { ...l, asset_id: a.id, graphic: undefined, in: 0 } as Layer : l)) })}>Replace</button>}
      </div>}
    </div>)}</div>
    {!items.length && <div className="dim">Upload videos, images or music to start.</div>}
  </>;
}

function relayout(ctx: Ctx, style: Exclude<Composition["style"], "custom">, params: StyleParams, keepCustom = true) {
  const { videos, images } = mediaOf(ctx.comp, ctx.amap);
  const texts = Object.fromEntries(ctx.comp.layers.filter((l): l is TextLayer => l.kind === "text").map((l) => [l.role, l.text]));
  const p = { ...params, header: params.header ?? texts.header, footer: params.footer ?? texts.footer, caption: params.caption ?? texts.caption, cta: params.cta ?? texts.cta };
  const layers = buildStyle(style, { width: ctx.comp.width, height: ctx.comp.height, fps: ctx.comp.fps, media: videos.length ? videos : images, images, params: p });
  const used = new Set(layers.flatMap((l) => (l.kind === "media" && l.asset_id ? [l.asset_id] : [])));
  // the creator's own layers stay — except clips the new layout now uses itself (no doubles)
  const keep = keepCustom ? ctx.comp.layers.filter((l) => l.role === "custom" && !(l.kind === "media" && !l.graphic && l.asset_id && used.has(l.asset_id) && ctx.amap.get(l.asset_id)?.kind === "video")) : [];
  const c = { ...ctx.comp, style, params: p as Record<string, unknown>, layers: [...layers, ...keep] };
  ctx.edit({ ...c, duration: Math.min(ctx.comp.duration, fitDuration(c.layers, ctx.amap, c.fps)) || ctx.comp.duration });
}

function LayoutsTab({ ctx }: { ctx: Ctx }) {
  const p = (ctx.comp.params ?? {}) as StyleParams;
  const [panels, setPanels] = useState(p.panels ?? 3);
  return <>
    <div className="sts-ph"><b>Layouts</b></div>
    <p className="dim sm">Rebuilds the layout with your media and text. Layers you added yourself stay.</p>
    {STYLES.map((s) => <button key={s.id} className={`sts-style ${ctx.comp.style === s.id ? "on" : ""}`} onClick={() => relayout(ctx, s.id, { ...p, panels })}>
      <StyleIcon id={s.id} /><span><b>{s.name}</b><small>{s.blurb}</small></span></button>)}
    <label className="sts-f">Panels in a stack<input type="range" min={2} max={6} value={panels} onChange={(e) => setPanels(+e.target.value)} onPointerUp={() => ctx.comp.style === "stacked" && relayout(ctx, "stacked", { ...p, panels })} /><b>{panels}</b></label>
    <div className="dim sm">Shorts player preview: use “Shorts preview” above the canvas (never exported).</div>
  </>;
}

function StyleIcon({ id }: { id: string }) {
  const r = (x: number, y: number, w: number, h: number, f = "currentColor", o = 1) => <rect x={x} y={y} width={w} height={h} rx={1.5} fill={f} opacity={o} />;
  return <svg viewBox="0 0 24 40" width="24" height="40" aria-hidden className="sts-sico">
    <rect x="0.5" y="0.5" width="23" height="39" rx="3" fill="none" stroke="currentColor" opacity=".5" />
    {id === "stacked" && <>{r(2, 3, 20, 10.5)}{r(2, 14.8, 20, 10.5)}{r(2, 26.5, 20, 10.5)}</>}
    {id === "cinematic" && <>{r(1.5, 1.5, 21, 37, "currentColor", 0.9)}</>}
    {id === "text" && <>{r(5, 9, 14, 2.4, "currentColor", 0.6)}{r(2, 14, 20, 11.5)}{r(6, 29, 12, 2.4, "currentColor", 0.6)}</>}
    {id === "blur" && <>{r(1.5, 1.5, 21, 37, "currentColor", 0.25)}{r(1.5, 14, 21, 12)}</>}
    {id === "centered" && <>{r(5, 13, 14, 14)}</>}
    {id === "mixed" && <>{r(1.5, 1.5, 21, 37, "currentColor", 0.2)}{r(2.5, 10, 19, 11)}{r(13, 24, 8, 10, "currentColor", 0.7)}{r(3, 3, 5, 3, "currentColor", 0.6)}</>}
  </svg>;
}

function TemplatesTab({ ctx }: { ctx: Ctx }) {
  const toast = useToast();
  const { workspace } = useAuth();
  const [q, setQ] = useState(""), [cat, setCat] = useState("All"), [mine, setMine] = useState<(Template & { data?: any; favorite?: boolean })[]>([]);
  const [favs, setFavs] = useState<Set<string>>(() => { try { return new Set(JSON.parse(localStorage.getItem("cu.shorts.favs") || "[]")); } catch { return new Set(); } });
  const ws = workspace?.id;
  const load = () => { if (ws) api<any[]>(`/workspaces/${ws}/composition-templates`).then((xs) => setMine(xs.map((x) => ({ id: x.id, name: x.name, category: x.category, style: x.data.style, params: x.data.params ?? {}, tags: [], custom: true, data: x.data, favorite: x.favorite })))).catch(() => {}); };
  useEffect(() => { load(); }, [ws]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleFav = (id: string) => setFavs((f) => { const n = new Set(f); if (n.has(id)) n.delete(id); else n.add(id); try { localStorage.setItem("cu.shorts.favs", JSON.stringify([...n])); } catch { /* */ } return n; });
  const all: (Template & { data?: any; favorite?: boolean })[] = [...mine, ...TEMPLATES];
  const shown = all.filter((t) => (cat === "All" || (cat === "Favourites" ? (t.custom ? t.favorite : favs.has(t.id)) : cat === "My templates" ? t.custom : t.category === cat))
    && (!q || `${t.name} ${t.category} ${t.tags.join(" ")}`.toLowerCase().includes(q.toLowerCase())));
  function apply(t: (typeof all)[number]) {
    const { videos, images } = mediaOf(ctx.comp, ctx.amap);
    const base = { width: ctx.comp.width, height: ctx.comp.height, fps: ctx.comp.fps, duration: ctx.comp.duration };
    let c: Composition;
    if (t.custom && t.data) c = fromTemplateData(t.data, [...videos, ...images], base);
    else c = applyTemplate(t, { width: base.width, height: base.height, fps: base.fps, media: videos.length ? videos : images, images }, base.duration);
    c = { ...c, layers: [...c.layers, ...ctx.comp.layers.filter((l) => l.role === "custom")] };
    ctx.edit({ ...c, duration: Math.min(base.duration, fitDuration(c.layers, ctx.amap, c.fps)) || base.duration });
    toast(`“${t.name}” applied — Ctrl+Z to go back`);
  }
  async function saveCurrent() {
    const name = prompt("Template name", "My layout");
    if (!name || !ws) return;
    const category = prompt(`Category (${CATEGORIES.slice(0, 4).join(", ")}…)`, "Custom") || "Custom";
    try { await api("/composition-templates", { method: "POST", body: { workspace_id: ws, name, category, data: toTemplateData(ctx.comp) } }); toast("Template saved"); load(); }
    catch (e) { toast((e as Error).message); }
  }
  return <>
    <div className="sts-ph"><b>Templates</b><button className="btn sm" onClick={saveCurrent}><Save size={12} />Save current</button></div>
    <label className="sts-search"><Search size={14} /><input placeholder="Search templates" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search templates" /></label>
    <select className="input" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category">
      {["All", "Favourites", "My templates", ...CATEGORIES].map((c) => <option key={c}>{c}</option>)}</select>
    <div className="sts-tlist">{shown.map((t) => <div key={t.id} className={`sts-tpl ${ctx.comp.template === t.id ? "on" : ""}`}>
      <StyleIcon id={t.style} />
      <span className="grow"><b>{t.name}</b><small>{t.category}{t.custom ? " · yours" : ""}</small></span>
      <button className="btn icon ghost sm" aria-label={`Favourite ${t.name}`} aria-pressed={t.custom ? !!t.favorite : favs.has(t.id)} onClick={() => t.custom
        ? api(`/composition-templates/${t.id}`, { method: "PATCH", body: { favorite: !t.favorite } }).then(load) : toggleFav(t.id)}>
        <Star size={13} fill={(t.custom ? t.favorite : favs.has(t.id)) ? "currentColor" : "none"} /></button>
      {t.custom && <>
        <button className="btn icon ghost sm" aria-label={`Duplicate ${t.name}`} onClick={() => api(`/composition-templates/${t.id}/duplicate`, { method: "POST" }).then(load)}><Copy size={13} /></button>
        <button className="btn icon ghost sm" aria-label={`Delete ${t.name}`} onClick={() => confirm(`Delete “${t.name}”?`) && api(`/composition-templates/${t.id}`, { method: "DELETE" }).then(load)}><Trash2 size={13} /></button></>}
      <button className="btn sm" onClick={() => apply(t)}>Apply</button>
    </div>)}</div>
    {!shown.length && <div className="dim">No templates match.</div>}
  </>;
}

const TEXT_PRESETS: { label: string; role: string; make: (portrait: boolean) => Partial<TextLayer> & { text: string } }[] = [
  { label: "Header", role: "header", make: (p) => ({ text: "Your headline here", box: { x: 0.5, y: 0.12, w: 0.9, h: 0.1 }, size: p ? 0.062 : 0.07, stroke: 0.06 }) },
  { label: "Footer", role: "footer", make: (p) => ({ text: "Follow for part 2", box: { x: 0.5, y: 0.9, w: 0.9, h: 0.08 }, size: p ? 0.048 : 0.056, color: "#fff27a" }) },
  { label: "Subtitle", role: "caption", make: (p) => ({ text: "Subtitle line", box: { x: 0.5, y: 0.72, w: 0.86, h: 0.08 }, size: p ? 0.048 : 0.056, stroke: 0.08 }) },
  { label: "CTA button", role: "cta", make: (p) => ({ text: "SUBSCRIBE", box: { x: 0.5, y: 0.82, w: 0.6, h: 0.06 }, size: p ? 0.045 : 0.052, color: "#0b0b14", bg_color: "#7cff6b", bg_opacity: 1, shadow: 0, anim: { in: "pop", out: "none", frames: 12 } }) },
  { label: "Branding", role: "brand", make: () => ({ text: "@yourchannel", box: { x: 0.5, y: 0.05, w: 0.6, h: 0.05 }, size: 0.034, opacity: 0.85 }) },
  { label: "POV", role: "pov", make: (p) => ({ text: "POV:", box: { x: 0.5, y: 0.16, w: 0.5, h: 0.06 }, size: p ? 0.07 : 0.08, color: "#fff27a", stroke: 0.05, shadow: 0.7 }) },
];

function TextTab({ ctx }: { ctx: Ctx }) {
  const portrait = ctx.comp.height >= ctx.comp.width;
  return <>
    <div className="sts-ph"><b>Text</b></div>
    <p className="dim sm">Fonts support Hindi, Telugu, Tamil and other Indian scripts.</p>
    {TEXT_PRESETS.map((t) => { const m = t.make(portrait); return <button key={t.label} className="sts-textp" onClick={() =>
      { const same = ctx.comp.layers.filter((l) => l.kind === "text" && (l.role === t.role || l.name === t.label)).length;
        const box = { ...m.box!, y: Math.min(0.95, m.box!.y + (m.box!.y > 0.5 ? -1 : 1) * 0.09 * same) };   // don't stack on top of an existing one
        add(ctx, textLayer(same ? "custom" : t.role, m.text, box, { ...m, box, name: t.label })); }}>
      <span style={{ color: m.color ?? "#fff", background: m.bg_color ?? "transparent" }}>{t.label}</span><small>{m.text}</small></button>; })}
  </>;
}

const OVERLAYS: { label: string; g: Graphic; over?: Partial<MediaLayer> }[] = [
  { label: "Vignette", g: { kind: "vignette", color: "#000000", strength: 0.75 } },
  { label: "Warm light leak", g: { kind: "light_leak", color: "#ffb347", color2: "#ff4e50", angle: 40, strength: 0.7 } },
  { label: "Cool light leak", g: { kind: "light_leak", color: "#7fd6ff", color2: "#7b61ff", angle: 300, strength: 0.6 } },
  { label: "Dark gradient (bottom)", g: { kind: "gradient", color: "#000000", color2: "#000000", angle: 180 }, over: { box: { x: 0.5, y: 0.85, w: 1, h: 0.3 }, opacity: 0.55 } },
  { label: "Colour wash", g: { kind: "solid", color: "#7b61ff" }, over: { opacity: 0.18 } },
];

function GraphicsTab({ ctx }: { ctx: Ctx }) {
  const imgs = ctx.assets.filter((a) => a.kind === "image" && a.status === "ready" && !(a as any).analysis?.generation?.source?.startsWith("studio."));
  return <>
    <div className="sts-ph"><b>Graphics</b></div>
    <div className="sts-h2">Overlays</div>
    {OVERLAYS.map((o) => <button key={o.label} className="sts-textp" onClick={() => add(ctx, graphicLayer("custom", o.label, o.g, { volume: 0, ...o.over }))}>
      <span className="sts-sw" style={{ background: o.g.kind === "vignette" ? "radial-gradient(#0000 40%, #000)" : o.g.kind === "light_leak" ? `radial-gradient(circle at 30% 20%, ${o.g.color}, ${o.g.color2}55 40%, transparent 70%)` : o.g.color }} />{o.label}</button>)}
    <div className="sts-h2">Logos, stickers & images <small className="dim">(PNG transparency kept)</small></div>
    <div className="sts-grid">{imgs.map((a) => <button key={a.id} className="sts-asset" onClick={() => {
      const ar = aspectOf(a as AssetLike), w = 0.22;
      add(ctx, mediaLayer("custom", a.filename.slice(0, 40), a as AssetLike, { x: 0.82, y: 0.1, w, h: (w * ctx.comp.width / ar) / ctx.comp.height }, { fit: "contain", volume: 0, anim: { in: "pop", out: "none", frames: 12 } }));
    }}>{a.thumbnail_url ? <img src={a.thumbnail_url} alt="" /> : null}<em>{a.filename}</em></button>)}</div>
    {!imgs.length && <div className="dim sm">Upload a PNG logo or sticker in Media.</div>}
  </>;
}

const LOOKS: { label: string; fx: MediaLayer["fx"] }[] = [
  { label: "Cinematic", fx: { contrast: 1.12, saturation: 0.92, brightness: -0.03 } }, { label: "Punchy", fx: { contrast: 1.2, saturation: 1.25 } },
  { label: "Warm", fx: { saturation: 1.12, brightness: 0.03 } }, { label: "Muted", fx: { saturation: 0.7, contrast: 0.95 } },
  { label: "B&W", fx: { saturation: 0, contrast: 1.1 } }, { label: "Bright", fx: { brightness: 0.12 } },
];

function EffectsTab({ ctx }: { ctx: Ctx }) {
  const L = ctx.comp.layers.find((l) => l.id === ctx.selected);
  if (!L || L.kind === "audio") return <><div className="sts-ph"><b>Effects</b></div><div className="dim">Select a video, image or text layer first (click it on the canvas).</div></>;
  const set = (patch: Partial<Layer>, key?: string) => ctx.edit({ ...ctx.comp, layers: ctx.comp.layers.map((l) => (l.id === L.id ? { ...l, ...patch } as Layer : l)) }, key);
  const fx = L.kind === "media" ? L.fx ?? {} : {};
  return <>
    <div className="sts-ph"><b>Effects</b><span className="dim sm">{L.name}</span></div>
    {L.kind === "media" && <>
      <div className="sts-h2">Looks</div>
      <div className="sts-chips">{LOOKS.map((x) => <button key={x.label} className="btn sm" onClick={() => set({ fx: { ...fx, brightness: 0, contrast: 1, saturation: 1, ...x.fx } } as any)}>{x.label}</button>)}
        <button className="btn sm ghost" onClick={() => set({ fx: { ...fx, brightness: 0, contrast: 1, saturation: 1 } } as any)}>Reset look</button></div>
      <div className="sts-h2">Frame</div>
      <div className="sts-chips">
        <button className="btn sm" onClick={() => set({ fx: { ...fx, radius: 0.03 } } as any)}>Rounded</button>
        <button className="btn sm" onClick={() => set({ fx: { ...fx, border: 0.006, border_color: fx.border_color ?? "#ffffff" } } as any)}>Border</button>
        <button className="btn sm" onClick={() => set({ fx: { ...fx, shadow: 0.02, shadow_opacity: 0.7 } } as any)}>Shadow</button>
        <button className="btn sm" onClick={() => set({ fx: { ...fx, blur: 0.03 } } as any)}>Blur</button>
        <button className="btn sm" onClick={() => set({ fx: { ...fx, flip_h: !fx.flip_h } } as any)}>Mirror</button>
        <button className="btn sm ghost" onClick={() => set({ fx: {} } as any)}>Clear</button></div>
      <div className="sts-h2">Motion</div>
      <div className="sts-chips">
        <button className="btn sm" onClick={() => set({ anim: { ...(L.anim ?? DEFAULT_ANIM), kenburns: 0.08 } })}>Slow zoom (Ken Burns)</button>
        <button className="btn sm" onClick={() => set({ fit: "contain", box: { ...L.box, w: L.box.w * 0.42, h: L.box.h * 0.42, x: 0.76, y: 0.76 }, fx: { ...fx, radius: 0.02, border: 0.005, shadow: 0.015 } } as any)}>Picture-in-picture</button>
      </div>
    </>}
    <div className="sts-h2">Entrance & exit</div>
    <div className="sts-chips">{(["fade", "slide-up", "slide-left", "zoom-in", "pop"] as const).map((a) =>
      <button key={a} className={`btn sm ${L.anim?.in === a ? "on" : ""}`} onClick={() => set({ anim: { ...(L.anim ?? DEFAULT_ANIM), in: a } })}>{a.replace("-", " ")} in</button>)}
      {(["fade", "slide-down", "zoom-out"] as const).map((a) =>
      <button key={a} className={`btn sm ${L.anim?.out === a ? "on" : ""}`} onClick={() => set({ anim: { ...(L.anim ?? DEFAULT_ANIM), out: a } })}>{a.replace("-", " ")} out</button>)}
      <button className="btn sm ghost" onClick={() => set({ anim: { ...DEFAULT_ANIM } })}>No animation</button></div>
    <p className="dim sm">Fine-tune every value in the panel on the right.</p>
  </>;
}

function BackgroundsTab({ ctx }: { ctx: Ctx }) {
  const [c1, setC1] = useState("#120a2a"), [c2, setC2] = useState("#3b1d7a");
  const main = ctx.comp.layers.find((l) => l.kind === "media" && l.role === "main") as MediaLayer | undefined;
  const imgs = ctx.assets.filter((a) => a.kind === "image" && a.status === "ready" && !(a as any).analysis?.generation?.source?.startsWith("studio."));
  const setBg = (L: MediaLayer | null) => {
    const rest = ctx.comp.layers.filter((l) => l.role !== "bg");
    ctx.edit({ ...ctx.comp, layers: L ? [{ ...L, role: "bg" }, ...rest] : rest, params: { ...(ctx.comp.params ?? {}), bg: L?.graphic?.kind === "gradient" ? "gradient" : L?.graphic ? "color" : L?.fx?.blur ? "blur" : L ? "image" : "black", color: c1, color2: c2 } });
  };
  return <>
    <div className="sts-ph"><b>Backgrounds</b></div>
    <p className="dim sm">Sits under everything. The main video doesn't move when you change it.</p>
    <button className="sts-textp" onClick={() => setBg(null)}><span className="sts-sw" style={{ background: "#000" }} />Black</button>
    <div className="sts-row"><input type="color" value={c1} onChange={(e) => setC1(e.target.value)} aria-label="Colour 1" /><input type="color" value={c2} onChange={(e) => setC2(e.target.value)} aria-label="Colour 2" /></div>
    <button className="sts-textp" onClick={() => setBg(graphicLayer("bg", "Colour background", { kind: "solid", color: c1 }))}><span className="sts-sw" style={{ background: c1 }} />Solid colour</button>
    <button className="sts-textp" onClick={() => setBg(graphicLayer("bg", "Gradient background", { kind: "gradient", color: c1, color2: c2, angle: 180 }))}><span className="sts-sw" style={{ background: `linear-gradient(${c1}, ${c2})` }} />Gradient</button>
    <button className="sts-textp" disabled={!main?.asset_id} onClick={() => main?.asset_id && setBg(mediaLayer("bg", "Blurred background", ctx.amap.get(main.asset_id)!, { x: 0.5, y: 0.5, w: 1, h: 1 },
      { in: main.in, volume: 0, fx: { blur: 0.035, brightness: -0.12, saturation: 1.1 } }))}><span className="sts-sw" style={{ background: "linear-gradient(135deg,#556,#99a)", filter: "blur(2px)" }} />Blurred main video</button>
    <div className="sts-h2">Image background</div>
    <div className="sts-grid">{imgs.map((a) => <button key={a.id} className="sts-asset" onClick={() => setBg(mediaLayer("bg", "Background image", a as AssetLike, { x: 0.5, y: 0.5, w: 1, h: 1 }, { volume: 0 }))}>
      {a.thumbnail_url ? <img src={a.thumbnail_url} alt="" /> : null}<em>{a.filename}</em></button>)}</div>
  </>;
}

function AiTab({ ctx }: { ctx: Ctx }) {
  const toast = useToast();
  const { videos, images } = mediaOf(ctx.comp, ctx.amap);
  const all = ctx.assets.filter((a) => a.status === "ready" && !(a as any).analysis?.generation?.source?.startsWith("studio."));
  const vids = videos.length ? videos : (all.filter((a) => a.kind === "video") as AssetLike[]);
  const imgs = images.length ? images : (all.filter((a) => a.kind === "image") as AssetLike[]);
  const sug = useMemo(() => suggestLayouts(vids, imgs, ctx.comp), [vids.map((v) => v.id).join(), imgs.length, ctx.comp.width, ctx.comp.height]); // eslint-disable-line react-hooks/exhaustive-deps
  const v = vids[0];
  const an = v?.analysis ?? null;
  return <>
    <div className="sts-ph"><b>AI Assistant</b></div>
    <p className="dim sm">Suggestions from measurements of your media. Nothing changes until you press Apply.</p>
    {v && <div className="sts-facts">
      <span>Source <b>{v.width}×{v.height}</b></span>
      <span>Faces <b>{an?.face_count ?? "—"}</b></span>
      <span>Scenes <b>{Array.isArray(an?.scenes) ? an!.scenes!.length : "—"}</b></span>
      <span>Speech <b>{(an as any)?.transcript ? "yes" : "not transcribed"}</b></span>
      <span>Subject at <b>{an?.subject_center_x != null ? `${Math.round(an.subject_center_x * 100)}%` : "—"}</b></span>
    </div>}
    {!an && v && <div className="dim sm">This clip hasn't been analysed yet (older uploads) — suggestions use its shape only.</div>}
    {sug.map((s) => { const t = TEMPLATES.find((x) => x.id === s.template)!; return <div key={s.template} className="sts-sug">
      <div className="row"><StyleIcon id={t.style} /><span className="grow"><b>{t.name}</b><small>{t.category}</small></span><span className={`badge ${s.confidence === "high" ? "ok" : ""}`}>{s.confidence}</span></div>
      <ul>{s.reason.map((r) => <li key={r}>{r}</li>)}</ul>
      <button className="btn sm sts-ai" onClick={() => {
        let c = applyTemplate(t, { width: ctx.comp.width, height: ctx.comp.height, fps: ctx.comp.fps, media: vids, images: imgs }, ctx.comp.duration);
        c = { ...c, layers: [...c.layers, ...ctx.comp.layers.filter((l) => l.role === "custom")] };
        ctx.edit({ ...c, duration: Math.min(ctx.comp.duration, fitDuration(c.layers, ctx.amap, c.fps)) });
        toast(`${t.name} applied — Ctrl+Z to undo`);
      }}><Sparkles size={12} />Apply</button></div>; })}
    {!sug.length && <div className="dim">Add a video or image to get suggestions.</div>}
  </>;
}
