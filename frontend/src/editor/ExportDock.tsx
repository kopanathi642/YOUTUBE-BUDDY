import { useCallback, useEffect, useState } from "react";
import { Rocket, Download, X, ShieldCheck, AlertTriangle } from "lucide-react";
import { api, ExportRec, fmtBytes, fmtDuration } from "../api";
import { useToast } from "../App";
import { Timeline, duration } from "../timeline";

type Preset = { id: string; label: string; short_side: number | null };
const dims = (tl: Timeline, p?: Preset) => {
  if (!p?.short_side || Math.min(tl.width, tl.height) <= p.short_side) return [tl.width, tl.height];
  const k = p.short_side / Math.min(tl.width, tl.height);
  return [Math.floor((tl.width * k) / 2) * 2, Math.floor((tl.height * k) / 2) * 2];
};

export default function ExportDock({ projectId, sequenceId, tl, flush, dirty, readOnly, focusSignal }: {
  projectId: string; sequenceId: string; tl: Timeline; flush: () => Promise<boolean>; dirty: boolean; readOnly: boolean; focusSignal: number;
}) {
  const toast = useToast();
  const [tab, setTab] = useState<"export" | "queue" | "presets">("export");
  const [presets, setPresets] = useState<Preset[]>([]);
  const [preset, setPreset] = useState("match");
  const [list, setList] = useState<ExportRec[]>([]);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { try { setList(await api<ExportRec[]>(`/projects/${projectId}/exports`)); } catch { /* shown on retry */ } }, [projectId]);
  useEffect(() => { api<Preset[]>("/export-presets").then(setPresets).catch(() => {}); load(); }, [load]);
  useEffect(() => { if (focusSignal) setTab("export"); }, [focusSignal]);
  const active = list.filter((e) => e.job.status === "queued" || e.job.status === "running");
  useEffect(() => { if (!active.length) return; const t = setInterval(load, 1500); return () => clearInterval(t); }, [active.length, load]);
  const total = duration(tl);
  const p = presets.find((x) => x.id === preset);
  const [w, h] = dims(tl, p);

  async function start() {
    setBusy(true);
    try {
      if (dirty && !(await flush())) throw new Error("Save your latest changes before exporting");
      await api(`/sequences/${sequenceId}/exports`, { method: "POST", body: { preset, idempotency_key: crypto.randomUUID() } });
      toast("Export queued — it keeps rendering in the cloud even if you close this tab");
      setTab("queue"); load();
    } catch (e) { toast((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div className="export-dock">
      <section className="panel bottom-panel" aria-label="Export settings">
        <div className="mini-tabs" role="tablist">
          <button role="tab" aria-selected={tab === "export"} className={tab === "export" ? "on" : ""} onClick={() => setTab("export")}>Export</button>
          <button role="tab" aria-selected={tab === "queue"} className={tab === "queue" ? "on" : ""} onClick={() => setTab("queue")}>Queue ({active.length})</button>
          <button role="tab" aria-selected={tab === "presets"} className={tab === "presets" ? "on" : ""} onClick={() => setTab("presets")}>Presets</button>
        </div>
        {tab === "export" && <div className="exp-form">
          <label>Format<select className="select sm" disabled><option>MP4 (H.264 + AAC)</option></select></label>
          <label>Resolution<select className="select sm" value={preset} onChange={(e) => setPreset(e.target.value)} disabled={readOnly}>
            {presets.map((p) => <option key={p.id} value={p.id}>{dims(tl, p).join("×")} · {p.label.split("·")[0].trim()}</option>)}</select></label>
          <label>Frame Rate<select className="select sm" disabled><option>{tl.fps} FPS</option></select></label>
        </div>}
        {tab === "queue" && <div className="exp-queue">
          {list.length === 0 && <span className="dim" style={{ fontSize: 12 }}>No exports yet.</span>}
          {list.slice(0, 6).map((e) => { const j = e.job, live = j.status === "queued" || j.status === "running"; return (
            <div key={e.id} className="q-row">
              <span className="grow ellipsis" style={{ fontSize: 12 }}>{e.settings.width}×{e.settings.height} · {fmtDuration(e.settings.duration_s)}</span>
              {live && <><div className="progress" style={{ width: 70 }}><i style={{ width: `${Math.round(j.progress * 100)}%` }} /></div><span className="mono dim" style={{ fontSize: 11 }}>{Math.round(j.progress * 100)}%</span>
                {!readOnly && <button className="btn icon ghost xs" aria-label="Cancel export" onClick={async () => { await api(`/jobs/${j.id}/cancel`, { method: "POST" }); load(); }}><X size={12} /></button>}</>}
              {j.status === "succeeded" && <>{e.validation?.ok && <span className="badge ok" title={Object.entries(e.validation.checks).map(([k, v]) => `${v ? "✓" : "✗"} ${k}`).join("\n")}><ShieldCheck size={11} />Verified</span>}
                <span className="dim" style={{ fontSize: 11 }}>{e.output_size_bytes ? fmtBytes(e.output_size_bytes) : ""}</span>
                {e.download_url && <a className="btn sm" href={e.download_url}><Download size={12} />Download</a>}</>}
              {j.status === "failed" && <span className="badge err" title={j.error ?? ""}><AlertTriangle size={11} />failed</span>}
              {j.status === "canceled" && <span className="badge">canceled</span>}
            </div>); })}
        </div>}
        {tab === "presets" && <div className="exp-queue dim" style={{ fontSize: 12 }}>
          {presets.map((p) => <div key={p.id}>• {p.label}{p.short_side ? ` (short side ${p.short_side}px)` : ""}</div>)}
          <div style={{ marginTop: 4 }}>4K, HEVC, ProRes and HDR appear here only once the render workers support them.</div>
        </div>}
      </section>
      <button className="btn primary export-big" onClick={start} disabled={busy || readOnly || total === 0} title={total === 0 ? "Add a clip first" : `${w}×${h} · ${tl.fps} fps · MP4`}>
        {busy ? <span className="spinner" /> : <Rocket size={20} />}Export Video
      </button>
    </div>
  );
}
