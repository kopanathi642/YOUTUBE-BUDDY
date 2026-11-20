import { useEffect, useRef, useState } from "react";
import { ArrowRightToLine, Replace, StretchHorizontal, Layers, ListEnd, BetweenHorizontalStart, SquarePlus } from "lucide-react";
import { EDIT_TYPES, EditType } from "../editops";

const ICON: Record<EditType, typeof Replace> = {
  insert: BetweenHorizontalStart, overwrite: SquarePlus, replace: Replace, fit: StretchHorizontal, top: Layers, append: ListEnd, rippleOverwrite: ArrowRightToLine,
};

/** DaVinci Resolve's edit overlay: drag a clip from the media bin onto the program monitor and drop it on one of the
 *  seven edit types. Mounted inside the viewer box; it stays invisible until a media item is dragged over it. */
export default function EditOverlay({ onEdit, disabled }: { onEdit: (type: EditType, assetId: string) => void; disabled?: boolean }) {
  const [on, setOn] = useState(false);
  const [hot, setHot] = useState<EditType | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const isAsset = (e: DragEvent | React.DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes("application/x-cu-asset");

  useEffect(() => {
    const host = root.current?.parentElement;
    if (!host || disabled) return;
    const enter = (e: DragEvent) => { if (isAsset(e)) { e.preventDefault(); setOn(true); } };
    const off = () => { setOn(false); setHot(null); };
    host.addEventListener("dragenter", enter);
    window.addEventListener("dragend", off);
    window.addEventListener("drop", off);
    return () => { host.removeEventListener("dragenter", enter); window.removeEventListener("dragend", off); window.removeEventListener("drop", off); };
  }, [disabled]);

  return (
    <div ref={root} className={`eo ${on ? "on" : ""}`} aria-hidden={!on}
      onDragOver={(e) => { if (isAsset(e)) e.preventDefault(); }}
      onDragLeave={(e) => { if (!root.current?.contains(e.relatedTarget as Node)) { setOn(false); setHot(null); } }}
      onDrop={(e) => { e.preventDefault(); setOn(false); setHot(null); }}>
      {on && (
        <div className="eo-grid" role="list" aria-label="Drop to choose how the clip goes into the timeline">
          {EDIT_TYPES.map((t) => {
            const Icon = ICON[t.id];
            return (
              <div key={t.id} role="listitem" className={`eo-tile eo-${t.id} ${hot === t.id ? "hot" : ""}`} title={t.hint}
                onDragEnter={() => setHot(t.id)} onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setHot(t.id); }}
                onDrop={(e) => { e.preventDefault(); e.stopPropagation(); const id = e.dataTransfer.getData("application/x-cu-asset"); setOn(false); setHot(null); if (id) onEdit(t.id, id); }}>
                <Icon size={22} aria-hidden /><b>{t.label}</b>
              </div>
            );
          })}
        </div>
      )}
      {on && hot && <p className="eo-hint">{EDIT_TYPES.find((t) => t.id === hot)!.hint}</p>}
    </div>
  );
}
