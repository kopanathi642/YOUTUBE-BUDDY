import { useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ArrowRight, ArrowDown, ArrowUpRight, Circle, Square, Check, X, Heart, Star, ThumbsUp, Bell, MapPin, MessageCircle, Sparkles, Flame, Zap, Smile, Play, Camera, Music } from "lucide-react";
import { api, Asset } from "../api";
import { uploadFile } from "../upload";
import { TITLE_TEMPLATES, TitleTemplate } from "../templates";

const ICONS = [["Arrow", ArrowRight], ["Arrow down", ArrowDown], ["Arrow up-right", ArrowUpRight], ["Circle", Circle], ["Box", Square], ["Tick", Check], ["Cross", X],
  ["Heart", Heart], ["Star", Star], ["Thumbs up", ThumbsUp], ["Bell", Bell], ["Location", MapPin], ["Speech", MessageCircle], ["Sparkle", Sparkles], ["Fire", Flame],
  ["Lightning", Zap], ["Smile", Smile], ["Play", Play], ["Camera", Camera], ["Music", Music]] as const;
const SPECIAL: { name: string; svg: (c: string) => string }[] = [
  { name: "Subscribe pill", svg: () => `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="320" viewBox="0 0 1024 320"><rect x="8" y="8" width="1008" height="304" rx="152" fill="#dc2626"/><text x="512" y="200" font-family="Arial, Helvetica, sans-serif" font-size="150" font-weight="800" fill="#fff" text-anchor="middle" letter-spacing="6">SUBSCRIBE</text></svg>` },
  { name: "Highlight ring", svg: (c) => `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="640" viewBox="0 0 1024 640"><ellipse cx="512" cy="320" rx="470" ry="270" fill="none" stroke="${c}" stroke-width="34"/></svg>` },
  { name: "Frame", svg: (c) => `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="576" viewBox="0 0 1024 576"><rect x="20" y="20" width="984" height="536" rx="36" fill="none" stroke="${c}" stroke-width="28"/></svg>` },
  { name: "Underline", svg: (c) => `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="160" viewBox="0 0 1024 160"><path d="M30 110 C 280 30, 560 30, 994 90" fill="none" stroke="${c}" stroke-width="34" stroke-linecap="round"/></svg>` },
];

/* Canva-style frames: full-frame 1920×1080 overlays with a see-through middle, placed over the video on the graphics track. */
const W = 1920, H = 1080;
const svgWrap = (body: string, defs = "") => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${defs ? `<defs>${defs}</defs>` : ""}${body}</svg>`;
const FRAMES: { name: string; svg: (c: string) => string }[] = [
  { name: "Rounded", svg: (c) => svgWrap(`<rect x="36" y="36" width="1848" height="1008" rx="64" fill="none" stroke="${c}" stroke-width="40"/>`) },
  { name: "Neon glow", svg: (c) => svgWrap(`<rect x="60" y="60" width="1800" height="960" rx="48" fill="none" stroke="${c}" stroke-width="16" filter="url(#g)"/><rect x="60" y="60" width="1800" height="960" rx="48" fill="none" stroke="#fff" stroke-width="5"/>`, `<filter id="g" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="14" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`) },
  { name: "Polaroid", svg: () => svgWrap(`<path fill="#fafafa" fill-rule="evenodd" d="M380 40h1160v1000H380z M440 100v760h1040V100z"/><rect x="380" y="40" width="1160" height="1000" fill="none" stroke="#d4d4d4" stroke-width="4"/>`) },
  { name: "Phone", svg: () => svgWrap(`<path fill="#111" fill-rule="evenodd" d="M690 20h540a70 70 0 0 1 70 70v900a70 70 0 0 1-70 70H690a70 70 0 0 1-70-70V90a70 70 0 0 1 70-70z M650 110v860h620V110z"/><rect x="890" y="44" width="140" height="26" rx="13" fill="#2a2a2a"/>`) },
  { name: "Cinema bars", svg: () => svgWrap(`<rect width="${W}" height="132" fill="#000"/><rect y="948" width="${W}" height="132" fill="#000"/>`) },
  { name: "Film strip", svg: () => svgWrap(`<rect width="${W}" height="90" fill="#111"/><rect y="990" width="${W}" height="90" fill="#111"/>` + Array.from({ length: 24 }, (_, i) => `<rect x="${20 + i * 80}" y="28" width="44" height="34" rx="6" fill="#f5f5f5"/><rect x="${20 + i * 80}" y="1018" width="44" height="34" rx="6" fill="#f5f5f5"/>`).join("")) },
  { name: "Spotlight", svg: () => svgWrap(`<rect width="${W}" height="${H}" fill="url(#v)"/>`, `<radialGradient id="v" cx="50%" cy="50%" r="62%"><stop offset="55%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity=".85"/></radialGradient>`) },
  { name: "Camera REC", svg: (c) => svgWrap(`<g fill="none" stroke="${c}" stroke-width="12" stroke-linecap="round"><path d="M80 220V80h140M1700 80h140v140M1840 860v140h-140M220 1000H80V860"/></g><circle cx="140" cy="140" r="20" fill="#ef4444"/><text x="178" y="156" font-family="Arial, sans-serif" font-size="46" font-weight="700" fill="${c}">REC</text>`) },
  { name: "Lower third", svg: (c) => svgWrap(`<rect x="90" y="800" width="900" height="120" rx="18" fill="${c}"/><rect x="90" y="920" width="620" height="64" rx="12" fill="#111" fill-opacity=".85"/>`) },
  { name: "Split screen", svg: (c) => svgWrap(`<rect x="950" y="0" width="20" height="${H}" fill="${c}"/>`) },
  { name: "Comic burst", svg: (c) => svgWrap(`<polygon fill="${c}" stroke="#111" stroke-width="10" points="1560,90 1610,190 1720,140 1690,250 1810,280 1700,340 1770,440 1650,420 1630,530 1560,450 1480,530 1470,420 1350,440 1420,340 1310,280 1430,250 1400,140 1510,190"/><text x="1560" y="340" font-family="Impact, Arial Black, sans-serif" font-size="110" fill="#111" text-anchor="middle">WOW!</text>`) },
  { name: "Subscribe bar", svg: () => svgWrap(`<rect x="1260" y="900" width="580" height="110" rx="55" fill="#dc2626"/><text x="1550" y="976" font-family="Arial, sans-serif" font-size="56" font-weight="800" fill="#fff" text-anchor="middle">SUBSCRIBE</text>`) },
  { name: "Gradient edges", svg: (c) => svgWrap(`<rect width="${W}" height="${H}" fill="url(#e)"/>`, `<linearGradient id="e" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c}" stop-opacity=".55"/><stop offset=".25" stop-color="${c}" stop-opacity="0"/><stop offset=".75" stop-color="${c}" stop-opacity="0"/><stop offset="1" stop-color="${c}" stop-opacity=".55"/></linearGradient>`) },
  { name: "Circle window", svg: () => svgWrap(`<path fill="#0b0b0f" fill-rule="evenodd" d="M0 0h${W}v${H}H0z M960 90a450 450 0 1 0 0.1 0z"/>`) },
];
export const FRAME_NAMES = FRAMES.map((f) => f.name);

const COLOURS = ["#ffffff", "#fde047", "#f97316", "#ef4444", "#ec4899", "#a855f7", "#3b82f6", "#22c55e", "#111111"];

async function svgToPng(svg: string, name: string): Promise<File> {
  const img = new Image();
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  await img.decode();
  const c = document.createElement("canvas");
  c.width = img.naturalWidth || 1024; c.height = img.naturalHeight || 1024;
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Could not draw the element"))), "image/png"));
  return new File([blob], `Element - ${name}.png`, { type: "image/png" });
}

export default function TemplatesTab({ section, projectId, readOnly, onTemplate, onElement, reload }: {
  section: "templates" | "text" | "stickers"; projectId: string; readOnly: boolean; onTemplate: (t: TitleTemplate) => void; onElement: (a: Asset) => void; reload: () => void;
}) {
  const [colour, setColour] = useState("#fde047"), [filled, setFilled] = useState(false), [busy, setBusy] = useState<string | null>(null), [err, setErr] = useState<string | null>(null);
  async function addElement(name: string, svg: string) {
    setBusy(name); setErr(null);
    try {
      const a = await uploadFile(projectId, await svgToPng(svg, name), () => {}, new AbortController().signal);
      reload();
      for (let i = 0; i < 60; i++) {   // wait for the normal media processing (thumbnail + proxy) before placing it
        const x = await api<Asset>(`/media/${a.id}`);
        if (x.status === "ready") { onElement(x); reload(); return; }
        if (x.status === "failed") throw new Error(x.status_detail || "Processing failed");
        await new Promise((r) => setTimeout(r, 1000));
      }
      throw new Error("Still processing — it will appear in Media when ready");
    } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  }
  return (
    <div className="bin-list tpl-tab">
      {section !== "stickers" && <><div className="label">Animated titles</div>
      <div className="tpl-grid">
        {TITLE_TEMPLATES.map((t) => <button key={t.id} className="tpl-card" disabled={readOnly} onClick={() => onTemplate(t)} title={`${t.desc} · ${t.seconds}s · added at the playhead`}>
          <span className={`tpl-prev ${t.id}`}><b>{t.sample}</b></span><span className="ellipsis">{t.name}</span></button>)}
      </div>
      </>}
      {section !== "text" && <><div className="label" style={{ marginTop: 10 }}>Frames</div>
      <div className="fr-grid">
        {FRAMES.map((f) => <button key={f.name} className="fr-tile" disabled={readOnly || !!busy} title={`Add the ${f.name} frame over your video at the playhead`} onClick={() => addElement(`Frame ${f.name}`, f.svg(colour))}>
          {busy === `Frame ${f.name}` ? <span className="spinner" /> : <span className="fr-prev" dangerouslySetInnerHTML={{ __html: f.svg(colour) }} />}<span>{f.name}</span></button>)}
      </div>
      <div className="label" style={{ marginTop: 10 }}>Elements &amp; stickers</div>
      <div className="row" style={{ gap: 4, flexWrap: "wrap", marginBottom: 6 }} role="radiogroup" aria-label="Element colour">
        {COLOURS.map((c) => <button key={c} role="radio" aria-checked={colour === c} aria-label={`Colour ${c}`} className={`swatch ${colour === c ? "on" : ""}`} style={{ background: c }} onClick={() => setColour(c)} />)}
        <label className="check" style={{ fontSize: 11, marginLeft: 4 }}><input type="checkbox" checked={filled} onChange={(e) => setFilled(e.target.checked)} />Filled</label>
      </div>
      <div className="el-grid">
        {ICONS.map(([name, I]) => <button key={name} className="el-tile" disabled={readOnly || !!busy} title={`Add ${name} at the playhead`}
          onClick={() => addElement(name, renderToStaticMarkup(<I size={1024} color={colour} strokeWidth={2.2} fill={filled ? colour : "none"} xmlns="http://www.w3.org/2000/svg" />))}>
          {busy === name ? <span className="spinner" /> : <I size={22} color={colour} fill={filled ? colour : "none"} />}<span>{name}</span></button>)}
        {SPECIAL.map((s) => <button key={s.name} className="el-tile" disabled={readOnly || !!busy} title={`Add ${s.name} at the playhead`} onClick={() => addElement(s.name, s.svg(colour))}>
          {busy === s.name ? <span className="spinner" /> : <span className="el-svg" dangerouslySetInnerHTML={{ __html: s.svg(colour) }} />}<span>{s.name}</span></button>)}
      </div>
      {err && <div className="error-box" style={{ fontSize: 11.5, marginTop: 6 }}>{err}</div>}
      <div className="dim" style={{ fontSize: 10.5, marginTop: 6 }}>Elements are saved to your media as transparent PNGs and placed on the graphics track. Icons: Lucide (ISC licence).</div></>}
    </div>
  );
}
