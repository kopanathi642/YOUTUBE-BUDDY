import { useState } from "react";
import {
  Image as ImageIcon, Scissors, Sparkles, Film, ChevronDown, ChevronUp, Zap, LayoutGrid, BarChart3, Layers, Smartphone, Crop, Wrench, AudioLines,
  Languages, Mic, Type, UserRoundX, FileText, Palette, Library, Wand, ArrowLeftRight, Workflow, Shapes, Upload, Crown, Coins, Lock,
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

export default function ToolSidebar({ caps, onAction, readOnly }: { caps: Caps; onAction: (id: string) => void; readOnly: boolean }) {
  const [open, setOpen] = useState({ shorts: true, video: false, audio: false });
  const plan = useAuth().workspace?.plan ?? "free";
  const row = (it: Item, sub = false) => {
    const c = it.cap ? caps.get(it.cap) : null;
    const locked = it.soon || (it.cap && !c?.ready);
    const title = it.soon ? "Planned — not available yet" : c && !c.ready ? `Needs: ${c.needs}` : it.label;
    return (
      <button key={it.id} className={`tool ${sub ? "sub" : ""} ${locked ? "locked" : ""}`} title={title}
        onClick={() => onAction(it.id)} disabled={readOnly && !["color", "fusion", "export", "effects", "transitions"].includes(it.id) && !locked}>
        <it.icon size={sub ? 15 : 17} /><span className="ellipsis">{it.label}</span>
        {it.soon ? <span className="badge soon">Soon</span> : locked ? <Lock size={11} className="dim" /> : null}
      </button>
    );
  };
  return (
    <aside className="ed-side" aria-label="Tools">
      <nav className="tools">
        <button className="tool" onClick={() => onAction("media")}><ImageIcon size={17} />Media</button>
        <button className="tool" onClick={() => onAction("edit")}><Scissors size={17} />Edit</button>
        <button className="tool magic-tool" onClick={() => onAction("magic")} disabled={readOnly}><Sparkles size={17} />AI Magic (One-Click)</button>
        <div className={`tool-group ${open.shorts ? "open" : ""}`}>
          <button className="tool group-head" onClick={() => setOpen({ ...open, shorts: !open.shorts })} aria-expanded={open.shorts}>
            <Film size={17} />Video to Shorts &amp; Clips{open.shorts ? <ChevronUp size={14} className="ml" /> : <ChevronDown size={14} className="ml" />}</button>
          {open.shorts && SHORTS.map((i) => row(i, true))}
        </div>
        <button className="tool" onClick={() => setOpen({ ...open, video: !open.video })} aria-expanded={open.video}><Wrench size={17} />Video Tools{open.video ? <ChevronUp size={14} className="ml" /> : <ChevronDown size={14} className="ml" />}</button>
        {open.video && VIDEO_TOOLS.map((i) => row(i, true))}
        <button className="tool" onClick={() => setOpen({ ...open, audio: !open.audio })} aria-expanded={open.audio}><AudioLines size={17} />Audio Tools{open.audio ? <ChevronUp size={14} className="ml" /> : <ChevronDown size={14} className="ml" />}</button>
        {open.audio && AUDIO_TOOLS.map((i) => row(i, true))}
        {MORE.map((i) => row(i))}
      </nav>
      <div className="credits card">
        <div className="row"><Coins size={22} color="#fbbf24" /><div><b>{plan === "free" ? "Free plan" : plan === "pro" ? "Pro plan" : "Creator plan"}</b><div className="dim" style={{ fontSize: 11.5 }}>Editor, exports &amp; free AI included</div></div></div>
        <Link className="btn primary" style={{ width: "100%", marginTop: 8 }} to="/settings#billing"><Crown size={15} />{plan === "free" ? "Upgrade Plan" : "Manage Plan"}</Link>
      </div>
    </aside>
  );
}
