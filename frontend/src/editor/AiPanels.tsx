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

const WHAT = [
  ["Best cuts & edits", "silence_remove"], ["Color grade (auto)", "auto_color"], ["Audio enhance", "loudness"], ["Remove noise", "loudness"],
  ["Stabilize footage", "stabilize"], ["Add captions", "transcribe"], ["Improve lighting", "auto_color"], ["Auto transitions", "silence_remove"],
  ["Suggest music", "music"], ["Create shorts & clips", "smart_reframe"],
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
            return <span key={label} className={ok ? "ok" : "no"} title={ok ? c!.needs : c ? `Needs: ${c.needs}` : "Planned"}>{ok ? <Check size={12} /> : <Lock size={11} />}{label}</span>;
          })}
        </div>
      </div>
    </section>
  );
}

const LANGS = ["Auto-detect", "English", "Hindi", "Spanish", "French", "German", "Portuguese", "Arabic", "Japanese", "Korean", "Chinese", "Tamil", "Telugu", "Bengali", "Marathi"];
const VOICES = ["Male", "Female", "Narrator", "Young", "Studio"];

export function VoicePanel({ caps }: { caps: Caps }) {
  const [tab, setTab] = useState<"tv" | "ls">("tv");
  const [from, setFrom] = useState("Auto-detect"), [to, setTo] = useState("English"), [voice, setVoice] = useState("Narrator");
  const [keep, setKeep] = useState(true), [lip, setLip] = useState(false);
  const dub = caps.get("dubbing"), ls = caps.get("lip_sync");
  return (
    <section className="panel ai-panel voice" aria-label="Translate and voice">
      <div className="mini-tabs wide" role="tablist">
        <button role="tab" aria-selected={tab === "tv"} className={tab === "tv" ? "on" : ""} onClick={() => setTab("tv")}>Translate &amp; Voice</button>
        <button role="tab" aria-selected={tab === "ls"} className={tab === "ls" ? "on" : ""} onClick={() => setTab("ls")}>Lip Sync</button>
      </div>
      {tab === "tv" ? <>
        <div className="row" style={{ fontSize: 13, fontWeight: 600 }}><Languages size={15} />Translate Video with Voice (Dubbing)</div>
        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <label><span className="label">From (Original)</span><select className="select sm" value={from} onChange={(e) => setFrom(e.target.value)}>{LANGS.map((l) => <option key={l}>{l}</option>)}</select></label>
          <label><span className="label">To (Translate)</span><select className="select sm" value={to} onChange={(e) => setTo(e.target.value)}>{LANGS.slice(1).map((l) => <option key={l}>{l}</option>)}</select></label>
        </div>
        <label><span className="label">Voice Output</span><select className="select sm"><option>AI Voice (Natural)</option><option>Keep original voice (subtitles only)</option></select></label>
        <div><span className="label">Voice Style</span>
          <div className="voices">{VOICES.map((v) => <button key={v} className={voice === v ? "on" : ""} onClick={() => setVoice(v)} aria-pressed={voice === v}><Mic size={15} />{v}</button>)}</div></div>
        <label className="check"><input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />Keep Original Audio (Background)</label>
        <label className="check"><input type="checkbox" checked={lip} onChange={(e) => setLip(e.target.checked)} />Auto Lip Sync (AI)</label>
        <button className="btn primary dub" disabled={!dub?.ready} title={dub?.ready ? "" : `Needs: ${dub?.needs}`}><Mic size={16} />Translate &amp; Dub</button>
        {!dub?.ready && <div className="provider-note"><Lock size={12} />Needs a dubbing provider: {dub?.needs ?? "ElevenLabs"}. Add the key in Render → Environment; nothing is faked meanwhile.</div>}
      </> : <>
        <div className="row" style={{ fontSize: 13, fontWeight: 600 }}><UserRoundX size={15} />AI Lip Sync</div>
        <label><span className="label">Target voice</span><select className="select sm"><option>Dubbed voice (from Translate)</option><option>Uploaded audio clip</option></select></label>
        <label><span className="label">Sync mode</span><select className="select sm"><option>Natural (recommended)</option><option>Precise</option></select></label>
        <div className="provider-note" style={{ marginTop: 4 }}>Lip sync changes a real person's face. It will require the person's recorded consent and adds a visible “AI-altered” label to exports.</div>
        <button className="btn primary dub" disabled title={`Needs: ${ls?.needs}`}><Play size={15} />Generate</button>
        <div className="provider-note"><Lock size={12} />Needs: {ls?.needs ?? "lip-sync GPU provider"}.</div>
      </>}
    </section>
  );
}

export function QuickActions({ caps, onAction, readOnly }: { caps: Caps; onAction: (id: string) => void; readOnly: boolean }) {
  const A: [string, string, any, string][] = [
    ["magic", "Auto Edit (Full Video)", Sparkles, "silence_remove"], ["short916", "Shorts Maker (9:16)", Smartphone, "smart_reframe"],
    ["clips", "Clips & Highlights", Clapperboard, "scene_detect"], ["scenes", "Scene Detect", ScanLine, "scene_detect"],
    ["silence", "Silence Remove", AudioWaveform, "silence_remove"], ["bg", "Background Remove", Eraser, "background_remove"],
    ["obj", "Object Remove", UserRoundX, "object_remove"], ["reframe", "Smart Reframe", Crop, "smart_reframe"],
  ];
  return (
    <section className="panel strip-panel" aria-label="AI quick actions">
      <div className="strip-head"><Sparkles size={15} /><b>AI Quick Actions</b></div>
      <div className="quick-grid">
        {A.map(([id, label, I, cap]) => { const c = caps.get(cap); const ok = !!c?.ready && !readOnly; return (
          <button key={id} className="qa" disabled={!ok} onClick={() => onAction(id)} title={c?.ready ? c.needs : `Needs: ${c?.needs ?? "provider"}`}>
            <I size={18} /><span>{label}</span>{!c?.ready && <Lock size={10} className="qa-lock" />}
          </button>); })}
      </div>
    </section>
  );
}

export function Recommendations({ tl, assets, edit, readOnly }: { tl: Timeline; assets: Map<string, Asset>; edit: (t: Timeline | null) => boolean; readOnly: boolean }) {
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
