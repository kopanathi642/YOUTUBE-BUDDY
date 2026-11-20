import { useState } from "react";
import { Bookmark, Trash2 } from "lucide-react";
import type { Clip } from "../timeline";

/** Resolve 21.1-style Inspector presets: save a clip's settings of one kind and apply them to any clip in one click.
 *  Kept in this browser (localStorage); every read/write is guarded so the editor works without storage. */
export type PresetKind = "video" | "audio" | "transition" | "transform";
type Preset = { id: string; name: string; kind: PresetKind; patch: Partial<Clip> };
const KEY = "cu-presets-v1";
const LABEL: Record<PresetKind, string> = { video: "effects & look", audio: "audio effects", transition: "transition & fades", transform: "transform & animation" };

function load(): Preset[] { try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; } }
function save(list: Preset[]) { try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, 200))); return true; } catch { return false; } }

/** The part of a clip a preset of this kind captures. */
export function pick(kind: PresetKind, c: Clip): Partial<Clip> {
  if (kind === "video") return { effects: c.effects ?? null, color: c.color ?? null, fx: c.fx ?? null };
  if (kind === "audio") return { audio_fx: c.audio_fx ?? null, denoise: !!c.denoise, volume: c.volume };
  if (kind === "transition") return { transition_in: c.transition_in ?? null, fade_in: c.fade_in, fade_out: c.fade_out };
  return { transform: c.transform, keyframes: c.keyframes ?? null };
}

export default function PresetBar({ kind, clip, apply, disabled }: { kind: PresetKind; clip: Clip; apply: (patch: Partial<Clip>, key: string) => void; disabled?: boolean }) {
  const [list, setList] = useState<Preset[]>(load);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");
  const mine = list.filter((p) => p.kind === kind);
  const doSave = () => {
    const n = name.trim().slice(0, 40);
    if (!n) return;
    const next = [...list.filter((p) => !(p.kind === kind && p.name === n)), { id: Math.random().toString(36).slice(2, 10), name: n, kind, patch: pick(kind, clip) }];
    setMsg(save(next) ? `Saved “${n}”` : "Couldn't save: browser storage is off");
    setList(next); setNaming(false); setName("");
  };
  return (
    <div className="preset-bar" role="group" aria-label={`Presets for ${LABEL[kind]}`}>
      <Bookmark size={13} aria-hidden />
      <select value="" disabled={disabled || mine.length === 0} aria-label={`Apply a saved ${LABEL[kind]} preset`}
        onChange={(e) => { const p = mine.find((x) => x.id === e.target.value); if (p) { apply(structuredClone(p.patch), `preset:${p.id}`); setMsg(`Applied “${p.name}”`); } }}>
        <option value="">{mine.length ? `Apply preset (${mine.length})…` : "No presets yet"}</option>
        {mine.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      {naming
        ? <><input autoFocus value={name} maxLength={40} placeholder="Preset name" aria-label="Preset name" onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") doSave(); if (e.key === "Escape") setNaming(false); }} />
          <button className="btn sm" onClick={doSave} disabled={!name.trim()}>Save</button></>
        : <button className="btn sm ghost" disabled={disabled} onClick={() => setNaming(true)} title={`Save this clip's ${LABEL[kind]} as a preset`}>Save as preset</button>}
      {mine.length > 0 && !naming && <button className="btn icon ghost xs" aria-label="Delete the last preset" title={`Delete “${mine[mine.length - 1].name}”`}
        onClick={() => { const next = list.filter((p) => p.id !== mine[mine.length - 1].id); save(next); setList(next); setMsg("Deleted"); }}><Trash2 size={12} /></button>}
      {msg && <span className="dim preset-msg" role="status">{msg}</span>}
    </div>
  );
}
