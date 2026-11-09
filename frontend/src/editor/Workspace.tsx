import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, GripVertical, LayoutGrid, RotateCcw, Check } from "lucide-react";

/* Professional, adjustable editor workspace:
 *  - top row:    Media bin | Program monitor | Dock A        (drag the bars between them to resize)
 *  - bottom row: Timeline                    | Dock B
 *  - docks hold panels as tabs; drag a tab to reorder it or move it to the other dock
 *  - every pane collapses to a slim rail; sizes, tabs and collapsed state are remembered per browser
 *  - presets (Edit / Color / AI & Voice / Audio) re-arrange everything in one click */

export type PanelId = "assistant" | "voice" | "color" | "scopes" | "nodes" | "quick" | "inspector" | "export" | "story" | "suggest";
export type DockId = "a" | "b";
export type PanelDef = { id: PanelId; label: string; icon: any; node: ReactNode };

export type Layout = {
  v: 2;
  side: boolean;          // tool sidebar expanded
  media: boolean;         // media bin open
  mediaW: number; dockAW: number; dockBW: number; topH: number;
  collapsed: Record<DockId, boolean>;
  docks: Record<DockId, PanelId[]>;
  active: Record<DockId, PanelId>;
};

const ALL: PanelId[] = ["assistant", "voice", "color", "scopes", "nodes", "quick", "inspector", "export", "story", "suggest"];
export const DEFAULT_LAYOUT: Layout = {
  v: 2, side: true, media: true, mediaW: 300, dockAW: 360, dockBW: 380, topH: 0.52,
  collapsed: { a: false, b: false },
  docks: { a: ["assistant", "voice", "color", "scopes", "nodes", "quick"], b: ["inspector", "export", "story", "suggest"] },
  active: { a: "assistant", b: "inspector" },
};
export const PRESETS: { id: string; label: string; hint: string; apply: (l: Layout) => Layout }[] = [
  { id: "edit", label: "Editing", hint: "Monitor, timeline and inspector", apply: (l) => ({ ...DEFAULT_LAYOUT, side: l.side }) },
  { id: "color", label: "Color", hint: "Big monitor, grading + scopes", apply: (l) => ({ ...DEFAULT_LAYOUT, side: false, media: false, topH: 0.6, dockAW: 420,
    docks: { a: ["color", "nodes", "assistant", "voice", "quick"], b: ["scopes", "inspector", "export", "story", "suggest"] }, active: { a: "color", b: "scopes" } }) },
  { id: "ai", label: "AI & Voice", hint: "Dubbing, captions and AI suggestions", apply: (l) => ({ ...DEFAULT_LAYOUT, side: l.side, active: { a: "voice", b: "suggest" } }) },
  { id: "deliver", label: "Export", hint: "Export settings and queue", apply: (l) => ({ ...DEFAULT_LAYOUT, side: l.side, active: { a: "assistant", b: "export" } }) },
];

const KEY = "cu.editor.layout.v2";
function load(): Layout {
  try {
    const l = JSON.parse(localStorage.getItem(KEY) || "null") as Layout | null;
    if (l && l.v === 2) {
      // keep it valid if panels were added/removed since it was saved
      const seen = new Set([...l.docks.a, ...l.docks.b]);
      const missing = ALL.filter((p) => !seen.has(p));
      const docks = { a: l.docks.a.filter((p) => ALL.includes(p)), b: [...l.docks.b.filter((p) => ALL.includes(p)), ...missing] };
      const fix = (d: DockId) => (docks[d].includes(l.active[d]) ? l.active[d] : docks[d][0]);
      return { ...DEFAULT_LAYOUT, ...l, docks, active: { a: fix("a"), b: fix("b") } };
    }
  } catch { /* storage blocked or bad JSON: use the default */ }
  // first visit on a laptop screen: start with the slim tools sidebar so the monitor and timeline get the room
  return typeof window !== "undefined" && window.innerWidth < 1440 ? { ...DEFAULT_LAYOUT, mediaW: 270, dockAW: 330, dockBW: 340 } : DEFAULT_LAYOUT;
}

export function useLayout() {
  const [layout, setLayout] = useState<Layout>(load);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(layout)); } catch { /* ignore */ } }, [layout]);
  /** Bring a panel to the front (opens its dock if collapsed). Used by the sidebar and top menu. */
  const focus = useCallback((p: PanelId) => setLayout((l) => {
    const d: DockId = l.docks.a.includes(p) ? "a" : "b";
    return { ...l, active: { ...l.active, [d]: p }, collapsed: { ...l.collapsed, [d]: false } };
  }), []);
  return { layout, setLayout, focus };
}

/** Drag handle between panes. Pointer drag, arrow keys (Shift = bigger steps), double-click to reset. */
function Splitter({ dir, label, onDelta, onReset }: { dir: "x" | "y"; label: string; onDelta: (d: number) => void; onReset: () => void }) {
  const last = useRef<number | null>(null);
  return (
    <div className={`ws-split ${dir}`} role="separator" aria-orientation={dir === "x" ? "vertical" : "horizontal"} aria-label={label} tabIndex={0}
      title={`${label} — drag to resize, double-click to reset`}
      onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); last.current = dir === "x" ? e.clientX : e.clientY; document.body.classList.add("ws-dragging"); }}
      onPointerMove={(e) => { if (last.current == null) return; const v = dir === "x" ? e.clientX : e.clientY; onDelta(v - last.current); last.current = v; }}
      onPointerUp={() => { last.current = null; document.body.classList.remove("ws-dragging"); }}
      onPointerCancel={() => { last.current = null; document.body.classList.remove("ws-dragging"); }}
      onDoubleClick={onReset}
      onKeyDown={(e) => {
        const s = e.shiftKey ? 60 : 16;
        if (dir === "x" && (e.key === "ArrowLeft" || e.key === "ArrowRight")) { e.preventDefault(); onDelta(e.key === "ArrowLeft" ? -s : s); }
        if (dir === "y" && (e.key === "ArrowUp" || e.key === "ArrowDown")) { e.preventDefault(); onDelta(e.key === "ArrowUp" ? -s : s); }
      }}><span /></div>
  );
}

function Dock({ id, layout, setLayout, panels, side }: { id: DockId; layout: Layout; setLayout: (f: (l: Layout) => Layout) => void; panels: Record<PanelId, PanelDef>; side: "top" | "bottom" }) {
  const tabs = layout.docks[id], active = layout.active[id], collapsed = layout.collapsed[id];
  const [over, setOver] = useState<number | null>(null);
  const move = (p: PanelId, to: number) => setLayout((l) => {
    const from: DockId = l.docks.a.includes(p) ? "a" : "b";
    const src = l.docks[from].filter((x) => x !== p);
    if (from !== id && src.length === 0) return l;                      // never empty a dock completely
    const dst = from === id ? src : [...l.docks[id]];
    const at = Math.max(0, Math.min(to - (from === id && l.docks[id].indexOf(p) < to ? 1 : 0), dst.length));
    dst.splice(at, 0, p);
    const docks = { ...l.docks, [from]: from === id ? dst : src, [id]: dst } as Layout["docks"];
    const act = { ...l.active, [id]: p };
    if (from !== id && l.active[from] === p) act[from] = docks[from][0];
    return { ...l, docks, active: act, collapsed: { ...l.collapsed, [id]: false } };
  });
  const drop = (e: React.DragEvent, at: number) => { e.preventDefault(); const p = e.dataTransfer.getData("text/x-cu-panel") as PanelId; setOver(null); if (p) move(p, at); };
  const setCollapsed = (v: boolean) => setLayout((l) => ({ ...l, collapsed: { ...l.collapsed, [id]: v } }));

  if (collapsed) return (
    <aside className="ws-dock rail" aria-label={`Panel dock ${id.toUpperCase()} (collapsed)`}>
      <button className="ws-rail-btn" onClick={() => setCollapsed(false)} title="Open this dock" aria-label="Open dock"><ChevronLeft size={15} /></button>
      {tabs.map((p) => { const P = panels[p]; return (
        <button key={p} className="ws-rail-btn" title={P.label} aria-label={P.label}
          onClick={() => setLayout((l) => ({ ...l, active: { ...l.active, [id]: p }, collapsed: { ...l.collapsed, [id]: false } }))}><P.icon size={16} /></button>); })}
    </aside>);

  return (
    <aside className={`ws-dock ${side}`} aria-label={`Panel dock ${id.toUpperCase()}`} data-dock={id}>
      <div className="ws-tabs" role="tablist" onDragOver={(e) => { e.preventDefault(); if (over == null) setOver(tabs.length); }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null); }} onDrop={(e) => drop(e, over ?? tabs.length)}>
        {tabs.map((p, i) => { const P = panels[p]; return (
          <button key={p} role="tab" aria-selected={active === p} className={`ws-tab ${active === p ? "on" : ""} ${over === i ? "drop-before" : ""}`}
            draggable onDragStart={(e) => { e.dataTransfer.setData("text/x-cu-panel", p); e.dataTransfer.effectAllowed = "move"; }}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setOver(e.clientX < r.left + r.width / 2 ? i : i + 1); }}
            onDrop={(e) => { e.stopPropagation(); drop(e, over ?? i); }}
            onClick={() => setLayout((l) => ({ ...l, active: { ...l.active, [id]: p } }))} title={`${P.label} — drag to move`}>
            <GripVertical size={11} className="grip" /><P.icon size={14} /><span>{P.label}</span>
          </button>); })}
        {over === tabs.length && <span className="ws-drop-end" />}
        <span className="grow" />
        <button className="ws-icon" onClick={() => setCollapsed(true)} title="Hide this dock" aria-label="Hide dock"><ChevronRight size={15} /></button>
      </div>
      <div className="ws-body">
        {tabs.map((p) => <div key={p} className="ws-pane" role="tabpanel" hidden={active !== p} aria-label={panels[p].label}>{panels[p].node}</div>)}
      </div>
    </aside>
  );
}

/** Premiere-style workspace switcher: one click re-arranges every pane for the job at hand. */
export function WorkspaceBar({ layout, setLayout }: { layout: Layout; setLayout: (f: (l: Layout) => Layout) => void }) {
  const cur = PRESETS.find((p) => { const x = p.apply(layout); return x.active.a === layout.active.a && x.active.b === layout.active.b && x.media === layout.media; })?.id;
  return (
    <div className="ws-bar" role="tablist" aria-label="Workspaces">
      {PRESETS.map((p) => <button key={p.id} role="tab" aria-selected={cur === p.id} className={cur === p.id ? "on" : ""} title={p.hint}
        onClick={() => setLayout(p.apply)}>{p.label}</button>)}
    </div>
  );
}

export function LayoutMenu({ layout, setLayout }: { layout: Layout; setLayout: (f: (l: Layout) => Layout) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, [open]);
  const toggle = (k: "side" | "media", label: string) => (
    <button role="menuitemcheckbox" aria-checked={layout[k]} className="menu-item" onClick={() => setLayout((l) => ({ ...l, [k]: !l[k] }))}>
      <span className="ws-check">{layout[k] && <Check size={13} />}</span>{label}</button>);
  const dock = (d: DockId, label: string) => (
    <button role="menuitemcheckbox" aria-checked={!layout.collapsed[d]} className="menu-item" onClick={() => setLayout((l) => ({ ...l, collapsed: { ...l.collapsed, [d]: !l.collapsed[d] } }))}>
      <span className="ws-check">{!layout.collapsed[d] && <Check size={13} />}</span>{label}</button>);
  return (
    <div className="ws-menu" ref={ref}>
      <button className="btn sm ghost" onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open} title="Layout options" aria-label="Layout options"><LayoutGrid size={15} /><span className="ws-menu-label">Layout</span></button>
      {open && <div className="menu ws-menu-pop" role="menu">
        <div className="menu-label">Layouts</div>
        {PRESETS.map((p) => <button key={p.id} role="menuitem" className="menu-item" onClick={() => { setLayout(p.apply); setOpen(false); }}>
          <span className="ws-check" /><span className="grow">{p.label}<small className="dim">{p.hint}</small></span></button>)}
        <div className="menu-label">Show</div>
        {toggle("media", "Media bin")}{dock("a", "Top-right panels")}{dock("b", "Bottom-right panels")}
        <button role="menuitem" className="menu-item" onClick={() => { setLayout(() => DEFAULT_LAYOUT); setOpen(false); }}><span className="ws-check"><RotateCcw size={13} /></span>Reset layout</button>
        <div className="ws-tip dim">Tip: drag the bars between panels to resize, and drag panel tabs to move them.</div>
      </div>}
    </div>
  );
}

/** The adjustable grid. Children are the fixed panes; docks are built from `panels`. */
export function Workspace({ layout, setLayout, panels, media, viewer, timeline }: {
  layout: Layout; setLayout: (f: (l: Layout) => Layout) => void; panels: Record<PanelId, PanelDef>;
  media: ReactNode; viewer: ReactNode; timeline: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
  const W = () => box.current?.clientWidth ?? 1200, H = () => box.current?.clientHeight ?? 700;
  const A = layout.collapsed.a, B = layout.collapsed.b;
  const cols = `${layout.media ? `${layout.mediaW}px 6px` : "34px 0px"} minmax(320px, 1fr) ${A ? "0px 42px" : `6px ${layout.dockAW}px`}`;
  const topPx = Math.round(clamp(layout.topH, 0.25, 0.8) * 100);
  return (
    <div className="ws" ref={box} style={{ gridTemplateRows: `minmax(220px, ${topPx}fr) 6px minmax(200px, ${100 - topPx}fr)` }}>
      <div className="ws-row" style={{ gridTemplateColumns: cols }}>
        {layout.media ? <div className="ws-cell">{media}</div>
          : <aside className="ws-dock rail"><button className="ws-rail-btn" onClick={() => setLayout((l) => ({ ...l, media: true }))} title="Show media bin" aria-label="Show media bin"><ChevronRight size={15} /></button></aside>}
        {layout.media ? <Splitter dir="x" label="Media bin width" onReset={() => setLayout((l) => ({ ...l, mediaW: DEFAULT_LAYOUT.mediaW }))}
          onDelta={(d) => setLayout((l) => ({ ...l, mediaW: clamp(l.mediaW + d, 220, W() * 0.4) }))} /> : <span />}
        <div className="ws-cell">{viewer}</div>
        {A ? <span /> : <Splitter dir="x" label="Right panel width" onReset={() => setLayout((l) => ({ ...l, dockAW: DEFAULT_LAYOUT.dockAW }))}
          onDelta={(d) => setLayout((l) => ({ ...l, dockAW: clamp(l.dockAW - d, 260, W() * 0.45) }))} />}
        <Dock id="a" layout={layout} setLayout={setLayout} panels={panels} side="top" />
      </div>
      <Splitter dir="y" label="Monitor / timeline height" onReset={() => setLayout((l) => ({ ...l, topH: DEFAULT_LAYOUT.topH }))}
        onDelta={(d) => setLayout((l) => ({ ...l, topH: clamp(l.topH + d / H(), 0.25, 0.8) }))} />
      <div className="ws-row" style={{ gridTemplateColumns: `minmax(0, 1fr) ${B ? "0px 42px" : `6px ${layout.dockBW}px`}` }}>
        <div className="ws-cell">{timeline}</div>
        {B ? <span /> : <Splitter dir="x" label="Inspector width" onReset={() => setLayout((l) => ({ ...l, dockBW: DEFAULT_LAYOUT.dockBW }))}
          onDelta={(d) => setLayout((l) => ({ ...l, dockBW: clamp(l.dockBW - d, 280, W() * 0.5) }))} />}
        <Dock id="b" layout={layout} setLayout={setLayout} panels={panels} side="bottom" />
      </div>
    </div>
  );
}

