import { useCallback, useEffect, useState } from "react";
import { Rocket, Download, X, ShieldCheck, AlertTriangle, CloudCog } from "lucide-react";
import { api, ExportRec, fmtBytes, fmtDuration, timeAgo } from "../api";
import { useToast } from "../App";
import { Timeline, duration } from "../timeline";

type Preset = { id: string; label: string; short_side: number | null };

function dims(tl: Timeline, p?: Preset) {
  if (!p?.short_side || Math.min(tl.width, tl.height) <= p.short_side) return [tl.width, tl.height];
  const k = p.short_side / Math.min(tl.width, tl.height);
  return [Math.floor((tl.width * k) / 2) * 2, Math.floor((tl.height * k) / 2) * 2];
}

export default function ExportPanel({ projectId, sequenceId, tl, flush, dirty, readOnly }: {
  projectId: string; sequenceId: string; tl: Timeline; flush: () => Promise<boolean>; dirty: boolean; readOnly: boolean;
}) {
  const toast = useToast();
  const [presets, setPresets] = useState<Preset[]>([]);
  const [preset, setPreset] = useState("match");
  const [list, setList] = useState<ExportRec[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setList(await api<ExportRec[]>(`/projects/${projectId}/exports`)); } catch (e) { setErr((e as Error).message); }
  }, [projectId]);
  useEffect(() => { api<Preset[]>("/export-presets").then(setPresets).catch(() => {}); load(); }, [load]);
  const active = list?.some((e) => e.job.status === "queued" || e.job.status === "running");
  useEffect(() => { if (!active) return; const t = setInterval(load, 1500); return () => clearInterval(t); }, [active, load]);

  async function start() {
    setBusy(true); setErr(null);
    try {
      if (dirty && !(await flush())) throw new Error("Save your latest changes before exporting");
      await api(`/sequences/${sequenceId}/exports`, { method: "POST", body: { preset, idempotency_key: crypto.randomUUID() } });
      toast("Export queued — it keeps rendering even if you close this tab");
      load();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  const p = presets.find((x) => x.id === preset);
  const [w, h] = dims(tl, p);
  const total = duration(tl);
  return (
    <div className="export">
      <div className="insp-sec">
        <label className="label" htmlFor="preset">Preset</label>
        <select id="preset" className="select" value={preset} onChange={(e) => setPreset(e.target.value)} disabled={readOnly}>
          {presets.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <dl className="meta" style={{ marginTop: 10 }}>
          <dt>Resolution</dt><dd>{w}×{h}</dd>
          <dt>Frame rate</dt><dd>{tl.fps} fps (sequence)</dd>
          <dt>Format</dt><dd>MP4 · H.264 · AAC stereo 48 kHz</dd>
          <dt>Duration</dt><dd>{fmtDuration(total / tl.fps)}</dd>
        </dl>
        <div className="dim" style={{ fontSize: 11.5, margin: "8px 0 12px" }}>Rendered on a cloud worker from your original files, then checked automatically. Higher resolutions, other codecs and HDR are not offered until the render workers genuinely support them.</div>
        {err && <div className="error-box" style={{ marginBottom: 10 }}>{err}</div>}
        <button className="btn primary lg" style={{ width: "100%" }} onClick={start} disabled={busy || readOnly || total === 0}>
          {busy ? <span className="spinner" /> : <><Rocket size={17} />Export video</>}
        </button>
        {total === 0 && <div className="dim" style={{ fontSize: 12, marginTop: 6 }}>Add a clip to the timeline first.</div>}
      </div>
      <div className="insp-sec">
        <div className="row" style={{ marginBottom: 8 }}><b className="grow">Render queue</b><CloudCog size={15} className="dim" /></div>
        {!list && <div className="skeleton" style={{ height: 60 }} />}
        {list?.length === 0 && <div className="dim" style={{ fontSize: 12.5 }}>No exports yet.</div>}
        <div className="grid" style={{ gap: 10 }}>
          {list?.map((e) => {
            const j = e.job;
            const live = j.status === "queued" || j.status === "running";
            return (
              <div key={e.id} className="exp-item">
                <div className="row" style={{ fontSize: 12.5 }}>
                  <span className="grow">{e.settings.width}×{e.settings.height} · {fmtDuration(e.settings.duration_s)} <span className="dim">· v{e.sequence_version}</span></span>
                  <span className={`badge ${j.status === "succeeded" ? "ok" : j.status === "failed" ? "err" : live ? "info" : ""}`}>{j.status === "running" ? `${Math.round(j.progress * 100)}%` : j.status}</span>
                </div>
                {live && <><div className="progress" style={{ marginTop: 6 }}><i style={{ width: `${Math.round(j.progress * 100)}%` }} /></div>
                  <div className="row" style={{ marginTop: 4 }}><span className="dim grow" style={{ fontSize: 11 }}>{j.stage ?? "waiting for a worker"}</span>
                    {!readOnly && <button className="btn sm ghost" onClick={async () => { await api(`/jobs/${j.id}/cancel`, { method: "POST" }); load(); }}><X size={12} />Cancel</button>}</div></>}
                {j.status === "failed" && <div className="dim" style={{ fontSize: 11.5, marginTop: 4 }}><AlertTriangle size={12} /> {j.error}</div>}
                {j.status === "succeeded" && (
                  <div className="row" style={{ marginTop: 6 }}>
                    {e.validation?.ok && <span className="badge ok" title={Object.entries(e.validation.checks).map(([k, v]) => `${v ? "✓" : "✗"} ${k}`).join("\n")}><ShieldCheck size={12} />Verified</span>}
                    <span className="dim grow" style={{ fontSize: 11 }}>{e.output_size_bytes ? fmtBytes(e.output_size_bytes) : ""} · {timeAgo(j.finished_at ?? e.created_at)}</span>
                    {e.download_url && <a className="btn sm" href={e.download_url}><Download size={13} />Download</a>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
