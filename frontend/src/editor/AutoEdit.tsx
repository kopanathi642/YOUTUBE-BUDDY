import { useEffect, useRef, useState } from "react";
import { api, Asset } from "../api";
import { Generation, useGeneration } from "../ai/core";

type Props = {
  projectId: string;
  assets: Asset[];
  timelineIds: string[];
  readOnly: boolean;
  onClose: () => void;
  onOpen: (id: string) => Promise<void>;
};

export default function AutoEdit({ projectId, assets, timelineIds, readOnly, onClose, onOpen }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const ready = assets.filter(a => a.status === "ready" && ["video", "image"].includes(a.kind));
  const [chosen, setChosen] = useState(() => {
    const timeline = [...new Set(timelineIds)].filter(id => ready.some(a => a.id === id));
    return (timeline.length ? timeline : ready.map(a => a.id)).slice(0, 20);
  });
  const [brief, setBrief] = useState("");
  const [seconds, setSeconds] = useState(30);
  const key = "cu.editor.autoEdit." + projectId;
  const [runId, setRunId] = useState<string | null>(() => {
    try { return sessionStorage.getItem(key); } catch { return null; }
  });
  const [generation] = useGeneration(runId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const clips = chosen.filter(id => ready.some(a => a.id === id));
  const available = Math.min(120, Math.floor(ready.reduce((n, a) => n + (clips.includes(a.id) ? a.kind === "image" ? 6 : a.duration_s || 0 : 0), 0)));
  const duration = Math.min(seconds, available);
  useEffect(() => { dialog.current?.showModal(); }, []);
  function remember(id: string | null) {
    setRunId(id);
    try { if (id) sessionStorage.setItem(key, id); else sessionStorage.removeItem(key); } catch { /* storage disabled */ }
  }
  async function submit() {
    setBusy(true); setError("");
    try {
      const result = await api<Generation>(`/projects/${projectId}/ai/tools/121/run`, {
        method: "POST", headers: { "idempotency-key": crypto.randomUUID() },
        body: { params: { clips, brief: `${duration} seconds. ${brief.trim()}` } },
      });
      remember(result.id);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function openCut() {
    setBusy(true); setError("");
    try { await onOpen(generation!.result.sequence_id); onClose(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const current = generation?.id === runId ? generation : null;
  return <dialog ref={dialog} className="card modal" aria-labelledby="auto-edit-heading" onCancel={onClose}
    style={{ width: "min(480px, 94vw)", maxHeight: "85vh", overflow: "auto", margin: "auto" }}>
    <div className="row"><h2 id="auto-edit-heading" className="grow">Auto-edit</h2><button className="btn sm" onClick={onClose}>Close</button></div>
    {runId ? <div aria-live="polite">
      {current?.status === "succeeded" && current.result?.sequence_id ?
        <><p>Your cut is ready as a new sequence.</p><button className="btn primary" disabled={busy} onClick={openCut}>Open edited timeline</button></>
        : <p>{current?.error || current?.status || "Checking your edit..."}</p>}
      {current && !["queued", "running"].includes(current.status) &&
        <button className="btn" disabled={busy || readOnly} onClick={() => { remember(null); setError(""); }}>Start another edit</button>}
    </div> : <form className="grid" style={{ gap: 12 }} onSubmit={e => { e.preventDefault(); void submit(); }}>
      <fieldset><legend>Source clips</legend>
        {ready.length === 0 && <p>Import video or images into the media bin to begin.</p>}
        <div style={{ maxHeight: 145, overflow: "auto" }}>{ready.map(a => <label className="row" key={a.id}>
          <input type="checkbox" checked={clips.includes(a.id)} disabled={!clips.includes(a.id) && clips.length >= 20}
            onChange={e => setChosen(e.target.checked ? [...clips, a.id] : clips.filter(id => id !== a.id))} />{a.filename}</label>)}</div>
      </fieldset>
      <label>How should the video feel?
        <textarea className="input" required maxLength={1980} value={brief} onChange={e => setBrief(e.target.value)}
          placeholder="A quiet wedding toast. Hold on the speaker, then show the reactions." /></label>
      <label>Length in seconds <input type="number" className="input" min={6} max={Math.max(6, available)} value={duration || ""} onChange={e => setSeconds(Number(e.target.value))} /></label>
      <p className="muted">{available < 6 ? "Choose at least 6 seconds of footage." : "Creates a new sequence from the selected source files."}</p>
      <button className="btn primary" disabled={busy || readOnly || !brief.trim() || duration < 6}>Create auto-edit</button>
    </form>}
    {error && <p role="alert">{error}</p>}
  </dialog>;
}
