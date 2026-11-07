import { useMemo, useState } from "react";
import { Sparkles, Wand2, Check, Lock, Languages, Mic, Play, Smartphone, Clapperboard, ScanLine, AudioWaveform, UserRoundX, Eraser, Crop, Lightbulb, X } from "lucide-react";
import { Asset } from "../api";
import { Timeline } from "../timeline";
import { PlanOp, buildPlan, silenceCuts, applyCuts, sceneSplits, applySceneSplits } from "../smart";

export type Capability = { id: string; label: string; ready: boolean; built_in: boolean; needs: string };
export type Caps = Map<string, Capability>;

export function PlanDialog({ ops, onApply, onClose }: { ops: PlanOp[]; onApply: (ids: Set<string>) => void; onClose: () => void }) {
  const [on, setOn] = useState(new Set(ops.map((o) => o.id)));
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="card modal" role="dialog" aria-modal="true" aria-labelledby="plan-h" style={{ width: "min(520px,100%)" }}>
        <div className="row"><Sparkles size={18} color="#c084fc" /><h2 id="plan-h" style={{ margin: 0, fontSize: 18 }} className="grow">AI Magic plan</h2><button className="btn icon ghost" aria-label="Close" onClick={onClose}><X size={16} /></button></div>
        <p className="muted" style={{ fontSize: 13 }}>Based on measurements of your clips. Review, untick anything you don't want, then apply. Every change can be undone.</p>
        {ops.length === 0 ? <div className="empty">Nothing to improve that I can measure right now — add clips with speech, music or footage first.</div> : (
          <div className="grid" style={{ gap: 8 }}>
            {ops.map((o) => (
              <label key={o.id} className="plan-op">
                <input type="checkbox" checked={on.has(o.id)} onChange={(e) => { const s = new Set(on); e.target.checked ? s.add(o.id) : s.delete(o.id); setOn(s); }} />
                <span><b>{o.label}</b><br /><span className="dim" style={{ fontSize: 12 }}>{o.detail}</span></span>
              </label>))}
          </div>)}
        <div className="dim" style={{ fontSize: 11.5, marginTop: 12 }}>Cost: free (runs on the editor; analysis already done by the cloud worker).</div>
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 14 }}>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!on.size} onClick={() => onApply(on)}><Wand2 size={15} />Apply {on.size} change{on.size === 1 ? "" : "s"}</button>
        </div>
      </div>
    </div>
  );
}

// Exactly what "Apply AI Magic" does (buildPlan in smart.ts) — keep the two in step.
const WHAT = [
  ["Cut silences", "silence_remove"], ["Auto colour", "auto_color"], ["Fix exposure", "auto_color"], ["Balance levels", "loudness"],
  ["Remove noise", "loudness"], ["Fade in & out", "silence_remove"],
] as const;

export function AssistantPanel({ caps, autoAdjust, setAutoAdjust, onMagic, readOnly, pending }: {
  caps: Caps; autoAdjust: boolean; setAutoAdjust: (v: boolean) => void; onMagic: () => void; readOnly: boolean; pending: boolean;
}) {
  return (
    <section className="panel ai-panel" aria-label="AI Creative Assistant">
      <div className="ai-head"><Sparkles size={17} color="#e879f9" /><b>AI Creative Assistant</b><span className="badge soon" style={{ marginLeft: "auto" }}>Beta</span></div>
      <label className="ai-toggle"><span>AI Auto-Analyze &amp; Auto-Adjust</span>
        <input type="checkbox" role="switch" checked={autoAdjust} onChange={(e) => setAutoAdjust(e.target.checked)} disabled={readOnly} />
        <i aria-hidden /></label>
      <div className="orb" aria-hidden><span>AI</span></div>
      <div className="dim" style={{ textAlign: "center", fontSize: 12 }}>One Click · Analyze · Adjust · Enhance</div>
      <button className="btn primary magic" onClick={onMagic} disabled={readOnly}>{pending ? <span className="spinner" /> : <Wand2 size={16} />}Apply AI Magic (Auto)</button>
      <div className="ai-what">
        <div className="dim" style={{ fontSize: 11.5, marginBottom: 4 }}>What it does with your video:</div>
        <div className="ai-grid">
          {WHAT.map(([label, cap]) => {
            const c = caps.get(cap);
            const ok = !!c?.ready;
            if (!ok) return null;   // only list what works right now
            return <span key={label} className="ok" title={c!.needs}><Check size={12} />{label}</span>;
          })}
        </div>
      </div>
    </section>
  );
}

export function VoicePanel({ caps, catalog, source, onDub, busy, onLipSync }: {
  caps: Caps; catalog: import("./AiTools").VoiceCatalog | null; source: { name: string } | null;
  onDub: (target: string, voiceId: string, keepOriginal: boolean) => void; busy: string | null; onLipSync?: () => void;
}) {
  const [tab, setTab] = useState<"tv" | "ls">("tv");
  const langs = [...new Set((catalog?.voices ?? []).map((v) => v.language))];
  const [to, setTo] = useState("hi");
  const voices = (catalog?.voices ?? []).filter((v) => v.language === to);
  const [voice, setVoice] = useState("");
  const [keep, setKeep] = useState(true);
  const dub = caps.get("dubbing"), ls = caps.get("lip_sync");
  const vid = voices.find((v) => v.id === voice) ? voice : voices[0]?.id ?? "";
  return (
    <section className="panel ai-panel voice" aria-label="Translate and voice">
      <div className="mini-tabs wide" role="tablist">
        <button role="tab" aria-selected={tab === "tv"} className={tab === "tv" ? "on" : ""} onClick={() => setTab("tv")}>Translate &amp; Voice</button>
        <button role="tab" aria-selected={tab === "ls"} className={tab === "ls" ? "on" : ""} onClick={() => setTab("ls")}>Lip Sync</button>
      </div>
      {tab === "tv" ? <>
        <div className="row" style={{ fontSize: 13, fontWeight: 600 }}><Languages size={15} />Translate Video with Voice (Dubbing)</div>
        <div className="dim" style={{ fontSize: 11.5 }}>Source: {source ? <b style={{ color: "var(--text)" }}>{source.name}</b> : "select a clip with speech"}</div>
        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <label><span className="label">From (Original)</span><select className="select sm" disabled><option>Auto-detect</option></select></label>
          <label><span className="label">To (Translate)</span><select className="select sm" value={to} onChange={(e) => setTo(e.target.value)}>
            {langs.map((l) => <option key={l} value={l}>{catalog?.languages[l] ?? l}</option>)}</select></label>
        </div>
        <div><span className="label">Voice Style</span>
          <div className="voices">{voices.map((v) => <button key={v.id} className={vid === v.id ? "on" : ""} onClick={() => setVoice(v.id)} aria-pressed={vid === v.id} title={v.label}><Mic size={15} />{v.style}</button>)}</div></div>
        <label className="check"><input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />Keep Original Audio (Background)</label>
        <div className="provider-note">Lip sync to the dubbed voice: dub first, then use the Lip Sync tab.</div>
        <button className="btn primary dub" disabled={!dub?.ready || !source || !vid || !!busy} onClick={() => onDub(to, vid, keep)}>
          {busy ? <span className="spinner" /> : <Mic size={16} />}{busy ? "Dubbing…" : "Translate & Dub"}</button>
        {busy ? <div className="provider-note">{busy}</div> : <div className="provider-note">{dub?.needs}</div>}
      </> : <>
        <div className="row" style={{ fontSize: 13, fontWeight: 600 }}><UserRoundX size={15} />AI Lip Sync</div>
        <div className="provider-note" style={{ marginTop: 4 }}>Lip sync changes a real person's face. It will require the person's recorded consent and adds a visible “AI-altered” label to exports.</div>
        {onLipSync && <button className="btn primary dub" disabled={!source} onClick={onLipSync}><Play size={15} />Open Lip Sync (AI Generator)</button>}
        <div className="provider-note">Runs on a hosted lip-sync model (Sync / Kling) once the server has a fal.ai key{ls?.ready ? "" : " — not added yet"}. The result comes back with Edit in Timeline.</div>
      </>}
    </section>
  );
}

export function QuickActions({ caps, onAction, readOnly, hide }: { caps: Caps; onAction: (id: string) => void; readOnly: boolean; hide: Set<string> }) {
  const A: [string, string, any, string][] = [
    ["magic", "Auto Edit (Full Video)", Sparkles, "silence_remove"], ["short916", "Shorts Maker (9:16)", Smartphone, "smart_reframe"],
    ["clips", "Clips & Highlights", Clapperboard, "scene_detect"], ["scenes", "Scene Detect", ScanLine, "scene_detect"],
    ["silence", "Silence Remove", AudioWaveform, "silence_remove"], ["bg", "Background Remove", Eraser, "background_remove"],
    ["obj", "Object Remove", Eraser, "object_remove"], ["reframe", "Smart Reframe", Crop, "smart_reframe"],
  ];
  return (
    <section className="panel strip-panel" aria-label="AI quick actions">
      <div className="strip-head"><Sparkles size={15} /><b>AI Quick Actions</b></div>
      <div className="quick-grid">
        {A.filter(([id, , , cap]) => !hide.has(id) && !(cap && caps.get(cap) && !caps.get(cap)!.ready)).map(([id, label, I, cap]) => { const c = cap ? caps.get(cap) : null; const ok = (!cap || !!c?.ready) && !readOnly; return (
          <button key={id} className="qa" disabled={!ok} onClick={() => onAction(id)} title={!cap ? "Opens in the AI Generator with this clip" : c?.ready ? c.needs : `Needs: ${c?.needs ?? "provider"}`}>
            <I size={18} /><span>{label}</span>{cap && !c?.ready && <Lock size={10} className="qa-lock" />}
          </button>); })}
      </div>
    </section>
  );
}

export function Recommendations({ tl, assets, edit, readOnly }: { tl: Timeline; assets: Map<string | null, Asset>; edit: (t: Timeline | null) => boolean; readOnly: boolean }) {
  const ops = useMemo(() => buildPlan(tl, assets), [tl, assets]);
  return (
    <section className="panel bottom-panel" aria-label="AI recommendations">
      <div className="strip-head"><Lightbulb size={15} color="#fde047" /><b>AI Recommendations</b></div>
      <div className="recs">
        {ops.length === 0 && <span className="dim" style={{ fontSize: 12 }}>No suggestions yet — they appear once clips are analysed.</span>}
        {ops.slice(0, 3).map((o) => <button key={o.id} className="rec" disabled={readOnly} title={o.detail} onClick={() => edit(o.apply(tl))}><Check size={12} />{o.label}</button>)}
        {ops.length > 0 && <button className="btn primary sm" disabled={readOnly} onClick={() => { let t = tl; for (const o of ops) t = o.apply(t); edit(t); }}>Apply All</button>}
      </div>
    </section>
  );
}

export { silenceCuts, applyCuts, sceneSplits, applySceneSplits };
