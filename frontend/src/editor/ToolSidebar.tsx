import { useEffect, useRef, useState } from "react";
import {
  Image as ImageIcon, Sparkles, Film, Zap, LayoutGrid, BarChart3, Layers, Smartphone, Crop, Wrench, AudioLines,
  Languages, Mic, Type, UserRoundX, FileText, Palette, Library, Wand, ArrowLeftRight, Workflow, Shapes, Upload, Crown, Coins, Eraser,
} from "lucide-react";
import { Link } from "react-router-dom";
import type { Caps } from "./AiPanels";
import { useAuth } from "../App";

type Item = { id: string; label: string; icon: any; cap?: string; soon?: boolean };

const SHORTS: Item[] = [
  { id: "short916", label: "Video to Shorts (Auto)", icon: Zap, cap: "smart_reframe" },
  { id: "clips", label: "Auto Clips & Highlights", icon: LayoutGrid, cap: "scene_detect" },
  { id: "viral", label: "Highlight Finder", icon: BarChart3, cap: "scene_detect" },
  { id: "batch", label: "Multi-Shorts (Batch)", icon: Layers, cap: "smart_reframe" },
  { id: "reels45", label: "Reels / Shorts Formatter", icon: Smartphone, cap: "smart_reframe" },
  { id: "reframe", label: "Smart Reframe (9:16)", icon: Crop, cap: "smart_reframe" },
];
const VIDEO_TOOLS: Item[] = [
  { id: "scenes", label: "Scene Detection", icon: LayoutGrid, cap: "scene_detect" },
  { id: "silence", label: "Silence Removal", icon: AudioLines, cap: "silence_remove" },
  { id: "autocolor", label: "Auto Color", icon: Palette, cap: "auto_color" },
  { id: "stabilize", label: "Stabilize (selected clip)", icon: Crop, cap: "stabilize" },
  { id: "bg", label: "Remove Background", icon: Wand, cap: "background_remove" },
  { id: "obj", label: "Remove Object (marked area)", icon: Eraser, cap: "object_remove" },
];
const AUDIO_TOOLS: Item[] = [
  { id: "loudness", label: "Balance Levels", icon: AudioLines, cap: "loudness" },
  { id: "denoise", label: "Noise Reduction", icon: Wand, cap: "loudness" },
];
const MORE: Item[] = [
  { id: "subtitle", label: "Subtitle & Translate", icon: Languages, cap: "translate" },
  { id: "voice", label: "Voice & Dubbing", icon: Mic, cap: "dubbing" },
  { id: "tts", label: "Text to Speech (TTS)", icon: Type, cap: "tts" },
  { id: "lipsync", label: "Lip Sync (AI Generator)", icon: UserRoundX },
  { id: "transcribe", label: "AI Transcribe", icon: FileText, cap: "transcribe" },
  { id: "design", label: "Design & Thumbnail", icon: ImageIcon },
  { id: "stock", label: "Stock Library", icon: Library },
  { id: "effects", label: "Effects & Filters", icon: Wand },
  { id: "transitions", label: "Transitions", icon: ArrowLeftRight },
  { id: "color", label: "Color Grading", icon: Palette },
  { id: "fusion", label: "VFX & Fusion", icon: Workflow },
  { id: "motion", label: "Motion Graphics (Titles)", icon: Shapes },
  { id: "elements", label: "Templates & Elements", icon: Layers },
  { id: "export", label: "Export & Share", icon: Upload },
];

type Cat = { id: string; label: string; icon: any; items?: Item[]; action?: string; hint?: string };
const CATS: Cat[] = [
  { id: "media", label: "Media", icon: ImageIcon, action: "media" },
  { id: "magic", label: "AI Magic", icon: Sparkles, action: "magic" },
  { id: "shorts", label: "Shorts", icon: Film, items: SHORTS, hint: "Turn long videos into vertical clips" },
  { id: "video", label: "Video", icon: Wrench, items: VIDEO_TOOLS, hint: "Clean up and fix footage" },
  { id: "audio", label: "Audio", icon: AudioLines, items: AUDIO_TOOLS, hint: "Levels and noise" },
  { id: "words", label: "Text & Voice", icon: Languages, items: MORE.filter((i) => ["subtitle", "voice", "tts", "lipsync", "transcribe"].includes(i.id)), hint: "Captions, translation, dubbing, voice-over" },
  { id: "design", label: "Elements", icon: Shapes, items: MORE.filter((i) => ["elements", "motion", "design", "stock"].includes(i.id)), hint: "Titles, templates, stickers, stock" },
  { id: "look", label: "Effects", icon: Palette, items: MORE.filter((i) => ["effects", "transitions", "color", "fusion"].includes(i.id)), hint: "Looks, transitions, grading, VFX" },
  { id: "export", label: "Export", icon: Upload, action: "export" },
];

/** Canva-style tool rail: one icon per category; categories with several tools open a flyout panel. */
export default function ToolSidebar({ caps, onAction, readOnly, hide }: { caps: Caps; onAction: (id: string) => void; readOnly: boolean; hide: Set<string> }) {
  const [open, setOpen] = useState<string | null>(null);
  const plan = useAuth().workspace?.plan ?? "free";
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(null); };
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null); };
    document.addEventListener("mousedown", h); document.addEventListener("keydown", k);
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("keydown", k); };
  }, [open]);
  const usable = (it: Item) => { const c = it.cap ? caps.get(it.cap) : null; return !(hide.has(it.id) || it.soon || (c && !c.ready)); };
  const row = (it: Item) => usable(it) && (
    <button key={it.id} className="tool" title={it.label} role="menuitem"
      onClick={() => { setOpen(null); onAction(it.id); }} disabled={readOnly && !["color", "fusion", "export", "effects", "transitions"].includes(it.id)}>
      <it.icon size={16} /><span className="ellipsis">{it.label}</span>
    </button>);
  const cat = CATS.find((c) => c.id === open);
  return (
    <aside className="ed-side rail" aria-label="Tools" ref={ref}>
      <nav className="rail-nav">
        {CATS.filter((c) => !c.items || c.items.some(usable)).map((c) => (
          <button key={c.id} className={`rail-btn ${open === c.id ? "on" : ""} ${c.id === "magic" ? "magic" : ""}`} aria-label={c.label}
            aria-haspopup={c.items ? "menu" : undefined} aria-expanded={c.items ? open === c.id : undefined}
            disabled={c.id === "magic" && readOnly}
            onClick={() => (c.items ? setOpen(open === c.id ? null : c.id) : (setOpen(null), onAction(c.action!)))}>
            <c.icon size={19} /><span>{c.label}</span>
          </button>))}
        <span className="grow" />
        <Link className="rail-btn plan" to="/settings#billing" title={plan === "free" ? "Upgrade plan" : "Manage plan"}>
          {plan === "free" ? <Crown size={18} /> : <Coins size={18} />}<span>{plan === "free" ? "Upgrade" : plan === "pro" ? "Pro" : "Creator"}</span>
        </Link>
      </nav>
      {cat?.items && (
        <div className="rail-fly" role="menu" aria-label={cat.label}>
          <div className="rail-fly-head"><b>{cat.label}</b><span className="dim">{cat.hint}</span></div>
          {cat.items.map(row)}
        </div>)}
    </aside>
  );
}
