import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Sparkles, Wand2, Palette, ArrowLeftRight, Shapes, Film, AudioLines, Languages, Scissors, Type, Upload, Bot, CornerDownLeft } from "lucide-react";
import { LOOKS } from "../grade";
import { TRANSITION_LIST } from "../transitions";
import { FRAME_NAMES } from "./Elements";

/** One thing the Find box can do. `run` is called when the user picks it. */
export type FindItem = { key: string; label: string; group: string; words: string; hint?: string; icon: any; run: () => void; disabled?: string };
export type Suggestion = { key: string; label: string; detail: string; run: () => void };

const GROUP_ORDER = ["Suggested", "Edit", "Fix & clean up", "Shorts", "Captions & voice", "Looks", "Transitions", "Frames & elements", "Titles", "AI Generator", "Export"];

/* Plain-language synonyms (English + common Hinglish) so people can type what they mean, not the tool's name. */
const SYN: Record<string, string> = {
  silence: "silence quiet gap pause dead air chup cut silences remove pauses",
  autocolor: "auto colour color fix brightness exposure dark light correct rang",
  loudness: "loud volume level balance audio sound awaaz normalize",
  denoise: "noise hum fan hiss background noise clean audio shor",
  stabilize: "shaky shake stable steady gimbal handheld jitter",
  bg: "background remove green screen chroma cut out person cutout",
  obj: "object remove erase logo watermark unwanted thing",
  scenes: "scene detect cut points shots",
  clips: "auto clips split scenes highlights",
  short916: "short shorts reel reels vertical 9:16 tiktok instagram youtube shorts",
  reframe: "reframe vertical crop 9:16 portrait face center",
  reels45: "4:5 portrait instagram feed reel",
  viral: "highlight best moments viral find best part",
  batch: "many shorts batch multiple clips",
  studio: "shorts studio layout stack split screen blur background text",
  subtitle: "subtitle subtitles caption captions srt translate language text on screen",
  voice: "dub dubbing voice language hindi english telugu tamil translate audio",
  tts: "text to speech voice over voiceover narration speak read aloud ai voice",
  transcribe: "transcribe transcript speech to text words",
  lipsync: "lip sync mouth talking",
  design: "thumbnail design poster cover image",
  stock: "stock footage library free videos music images",
  effects: "effects filters fx",
  transitions: "transition fade dissolve wipe slide between clips",
  color: "color colour grading grade wheels lut curves davinci resolve",
  fusion: "vfx fusion nodes composite",
  motion: "title titles text heading animated text motion graphics",
  elements: "elements stickers shapes arrows icons frames canva templates overlay",
  export: "export render download save mp4 publish share",
  magic: "ai magic auto edit one click fix everything clean up",
  split: "split cut razor blade divide",
  addvideo: "add video track layer",
  addaudio: "add audio track music track",
  record: "record webcam camera mic microphone",
};

function score(item: FindItem, q: string): number {
  const exact = q.trim().match(/^"(.+)"$/);   // "…" = exact text match on the name only (Resolve 21.1 style)
  if (exact) return item.label.toLowerCase().includes(exact[1].toLowerCase()) ? 10 : 0;
  const hay = (item.label + " " + item.words + " " + item.group).toLowerCase();
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  let s = 0;
  for (const t of terms) {
    if (item.label.toLowerCase().startsWith(t)) s += 6;
    else if (item.label.toLowerCase().includes(t)) s += 4;
    else if (hay.includes(t)) s += 2;
    else if (t.length > 3 && hay.includes(t.slice(0, -1))) s += 1;   // "captions" → "caption"
    else return 0;
  }
  return s;
}

/**
 * Find AI: one search box for every tool, look, transition, frame and AI tool in the editor, plus
 * "Suggested for your video" — real suggestions computed from the timeline (silences, colour, audio levels, format).
 * Ctrl+K (or /) focuses it from anywhere in the editor.
 */
export default function FindAI({ action, hasSel, isVideoSel, onLook, onTransitions, onTool, suggestions, hide }: {
  action: (id: string) => void; hasSel: boolean; isVideoSel: boolean;
  onLook: (i: number) => void; onTransitions: () => void; onTool: (id: string) => void;
  suggestions: Suggestion[]; hide: Set<string>;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const act = useRef(action);
  act.current = action;   // chained commands must use the editor's latest state, not the one from when the list was built
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement).closest("input, textarea, select, [contenteditable]");
      if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") || (e.key === "/" && !typing)) { e.preventDefault(); input.current?.focus(); setOpen(true); }
    };
    const m = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("keydown", k); document.addEventListener("mousedown", m);
    return () => { window.removeEventListener("keydown", k); document.removeEventListener("mousedown", m); };
  }, []);

  const items = useMemo<FindItem[]>(() => {
    const needSel = hasSel ? undefined : "Select a clip on the timeline first";
    const needVideo = isVideoSel ? undefined : "Select a video clip first";
    const a = (id: string, label: string, group: string, icon: any, hint?: string, disabled?: string): FindItem =>
      ({ key: id, label, group, icon, hint, disabled, words: SYN[id] ?? "", run: () => act.current(id) });
    const list: FindItem[] = [
      a("magic", "AI Magic — clean up my video in one click", "Fix & clean up", Sparkles, "Review every change before it's applied"),
      a("silence", "Remove silences", "Fix & clean up", AudioLines),
      a("autocolor", "Auto colour fix", "Fix & clean up", Palette),
      a("loudness", "Balance audio levels", "Fix & clean up", AudioLines),
      a("denoise", "Reduce background noise", "Fix & clean up", AudioLines),
      a("stabilize", "Stabilize shaky video", "Fix & clean up", Wand2, undefined, needVideo),
      a("bg", "Remove background", "Fix & clean up", Wand2, "Clips up to 60 s", needVideo),
      a("obj", "Remove an object", "Fix & clean up", Wand2, "Mark the area on the frame", needVideo),
      a("scenes", "Find scene changes", "Edit", Scissors),
      a("clips", "Split at every scene change", "Edit", Scissors),
      { key: "split", label: "Split at playhead", group: "Edit", icon: Scissors, words: SYN.split, hint: "Shortcut: S",
        run: () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "s" })) },
      a("short916", "Make a Short (9:16)", "Shorts", Film),
      a("reframe", "Smart reframe to vertical", "Shorts", Film),
      a("reels45", "Make a 4:5 Reel", "Shorts", Film),
      a("viral", "Find the best moments", "Shorts", Film),
      a("batch", "Make many Shorts at once", "Shorts", Film),
      a("studio", "Shorts Creative Studio", "Shorts", Film, "Layouts, stacks, blur, big text"),
      a("subtitle", "Add captions / subtitles", "Captions & voice", Languages),
      a("transcribe", "Get the transcript", "Captions & voice", Languages),
      a("voice", "Dub into another language", "Captions & voice", Languages),
      a("tts", "Text to voice (AI voice-over)", "Captions & voice", Languages),
      a("lipsync", "Lip sync", "Captions & voice", Languages, "Opens the AI Generator"),
      a("motion", "Add a title", "Titles", Type),
      a("elements", "Animated title templates", "Titles", Type),
      a("color", "Colour grading (wheels, scopes)", "Looks", Palette),
      a("fusion", "VFX node view", "Looks", Palette),
      a("effects", "Effects & filters", "Looks", Palette),
      a("transitions", "Transitions panel", "Transitions", ArrowLeftRight),
      a("design", "Make a thumbnail", "Frames & elements", Shapes),
      a("stock", "Stock videos, music and images", "Frames & elements", Shapes),
      a("export", "Export video (MP4)", "Export", Upload),
    ].filter((i) => !hide.has(i.key));
    LOOKS.forEach((l, i) => list.push({ key: `look-${i}`, label: `${l.name} look`, group: "Looks", icon: Palette, words: "look filter lut preset grade colour color " + l.name, disabled: needSel, run: () => onLook(i), hint: "Applies to the selected clip" }));
    TRANSITION_LIST.forEach((t) => list.push({ key: `tr-${t.type}`, label: t.label, group: "Transitions", icon: ArrowLeftRight, words: "transition " + t.group, disabled: needSel, run: onTransitions, hint: "Opens transitions for the selected clip" }));
    FRAME_NAMES.forEach((n) => list.push({ key: `fr-${n}`, label: `${n} frame`, group: "Frames & elements", icon: Shapes, words: "frame overlay border sticker canva element " + n, run: () => action("elements"), hint: "Opens Frames & elements" }));
    const GEN: [string, string, string][] = [["026", "Make video sharper (upscale)", "upscale hd 4k sharp blurry quality"], ["029", "Slow motion", "slow motion slowmo smooth"],
      ["052", "Write a hook for my video", "hook intro script first 15 seconds"], ["054", "Write title, description & tags", "description tags seo youtube title"],
      ["041", "AI voice studio", "voice tts narration"], ["090", "Text on image", "image text poster"], ["082", "Erase from a photo", "photo erase clean"]];
    GEN.forEach(([id, label, w]) => list.push({ key: `gen-${id}`, label, group: "AI Generator", icon: Bot, words: w, run: () => onTool(id), hint: "Opens in the AI Generator" }));
    return list;
  }, [action, hasSel, isVideoSel, onLook, onTransitions, onTool, hide]);

  /** "remove silences and add captions, then export" → the best tool for each part, run one after another. */
  const command = useMemo<FindItem | null>(() => {
    const parts = q.split(/\s*(?:,|;|&|\+|\band\b|\bthen\b|\baur\b|\bphir\b)\s*/i).map((x) => x.trim()).filter((x) => x.length > 2);
    if (parts.length < 2) return null;
    const steps: FindItem[] = [];
    for (const part of parts) {
      const best = items.filter((i) => !i.disabled && i.group !== "AI Generator").map((i) => [i, score(i, part)] as const).filter(([, s]) => s > 0).sort((x, y) => y[1] - x[1])[0];
      if (best && !steps.includes(best[0])) steps.push(best[0]);
    }
    if (steps.length < 2) return null;
    return { key: "cmd", group: "Suggested", icon: Bot, words: "", label: "Do all: " + steps.map((x) => x.label.replace(/ —.*$/, "")).join(" → "),
      hint: `${steps.length} steps, one after another (each one can be undone with Ctrl+Z)`,
      run: () => steps.forEach((st, n) => setTimeout(() => st.run(), n * 900)) };
  }, [q, items]);

  const results = useMemo(() => {
    if (!q.trim()) return suggestions.map<FindItem>((s) => ({ key: "sg-" + s.key, label: s.label, hint: s.detail, group: "Suggested", icon: Sparkles, words: "", run: s.run }));
    const found = items.map((i) => [i, score(i, q)] as const).filter(([, s]) => s > 0).sort((x, y) => y[1] - x[1]).slice(0, 14).map(([i]) => i);
    return command ? [command, ...found] : found;
  }, [q, items, suggestions, command]);
  useEffect(() => setHi(0), [q]);

  const grouped = useMemo(() => {
    const g = new Map<string, FindItem[]>();
    for (const r of results) g.set(r.group, [...(g.get(r.group) ?? []), r]);
    return [...g.entries()].sort((a, b) => GROUP_ORDER.indexOf(a[0]) - GROUP_ORDER.indexOf(b[0]));
  }, [results]);
  const flat = grouped.flatMap(([, v]) => v);

  function pick(i: FindItem) {
    if (i.disabled) return;
    setOpen(false); setQ(""); input.current?.blur(); i.run();
  }

  return (
    <div className="find-ai" ref={box}>
      <label className="find-box">
        <Search size={15} aria-hidden />
        <span className="sr-only">Find tools, effects and frames</span>
        <input ref={input} value={q} placeholder="Find tools, effects, frames…" aria-label="Find tools, effects and frames" role="combobox"
          aria-expanded={open} aria-controls="find-list" aria-activedescendant={flat[hi] ? `find-${flat[hi].key}` : undefined}
          onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, flat.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
            else if (e.key === "Enter" && flat[hi]) { e.preventDefault(); pick(flat[hi]); }
            else if (e.key === "Escape") { setOpen(false); input.current?.blur(); }
          }} />
        <kbd>Ctrl K</kbd>
      </label>
      {open && (
        <div className="find-pop" id="find-list" role="listbox" aria-label="Find results">
          {!q.trim() && <div className="find-head"><Sparkles size={14} />Suggested for your video{suggestions.length === 0 && " — nothing to fix right now. Try typing what you want to do."}</div>}
          {q.trim() && flat.length === 0 && <div className="find-empty">No match for {q.trim().startsWith('"') ? q : `“${q}”`}. Try words like <b>captions</b>, <b>shaky</b>, <b>vertical</b>, <b>noise</b> or <b>frame</b>.</div>}
          {grouped.map(([g, list]) => (
            <div key={g} className="find-group">
              {q.trim() && <div className="find-gl">{g}</div>}
              {list.map((i) => { const n = flat.indexOf(i); const I = i.icon; return (
                <button key={i.key} id={`find-${i.key}`} role="option" aria-selected={n === hi} aria-disabled={!!i.disabled}
                  className={`find-row${n === hi ? " hi" : ""}${i.disabled ? " off" : ""}`} onMouseEnter={() => setHi(n)} onClick={() => pick(i)}
                  title={i.disabled}>
                  <I size={16} aria-hidden /><span className="find-l"><b>{i.label}</b>{(i.disabled || i.hint) && <small>{i.disabled ?? i.hint}</small>}</span>
                  {n === hi && !i.disabled && <CornerDownLeft size={14} className="dim" aria-hidden />}
                </button>); })}
            </div>
          ))}
          <div className="find-foot">↑ ↓ to move · Enter to use · plain words (“remove shaky”, “hindi captions”) · several at once (“remove silences and add captions”) · “quotes” for exact name</div>
        </div>
      )}
    </div>
  );
}
