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

export default function TemplatesTab({ projectId, readOnly, onTemplate, onElement, reload }: {
  projectId: string; readOnly: boolean; onTemplate: (t: TitleTemplate) => void; onElement: (a: Asset) => void; reload: () => void;
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
      <div className="label">Animated titles</div>
      <div className="tpl-grid">
        {TITLE_TEMPLATES.map((t) => <button key={t.id} className="tpl-card" disabled={readOnly} onClick={() => onTemplate(t)} title={`${t.desc} · ${t.seconds}s · added at the playhead`}>
          <span className={`tpl-prev ${t.id}`}><b>{t.sample}</b></span><span className="ellipsis">{t.name}</span></button>)}
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
      <div className="dim" style={{ fontSize: 10.5, marginTop: 6 }}>Elements are saved to your media as transparent PNGs and placed on the graphics track. Icons: Lucide (ISC licence).</div>
    </div>
  );
}
