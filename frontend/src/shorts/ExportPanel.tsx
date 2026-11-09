import { useEffect, useRef, useState } from "react";
import { X, Download, Loader2, Check, AlertTriangle, Package } from "lucide-react";
import { api, ApiError, ExportRec, Job, SequenceDoc, fmtBytes } from "../api";
import { useToast } from "../App";
import { AssetLike, Composition, RATIOS, canvasFor, changeCanvas, compileComposition, ratioOf } from "../compose";
import { measure } from "./ShortsStudio";

type Row = { ratio: string; w: number; h: number; seqId?: string; exportId?: string; status: "waiting" | "rendering" | "done" | "failed"; error?: string; rec?: ExportRec };

/** Render the composition in one or more shapes (each its own sequence + export), then download each or all as a ZIP. */
export default function ExportPanel({ comp, amap, projectId, seq, onClose }: { comp: Composition; amap: Map<string, AssetLike>; projectId: string; seq: SequenceDoc; onClose: () => void }) {
  const toast = useToast();
  const cur = ratioOf(comp.width, comp.height);
  const [pick, setPick] = useState<string[]>([cur]);
  const [preset, setPreset] = useState("match");
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [zip, setZip] = useState<{ job?: Job; url?: string | null } | null>(null);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  const short = Math.min(comp.width, comp.height);

  async function start() {
    setBusy(true); setZip(null);
    const want = pick.map((id) => {
      if (id === cur) return { ratio: id, w: comp.width, h: comp.height };
      const r = RATIOS.find((x) => x.id === id)!;
      const c = canvasFor(r.w, r.h, Math.max(r.w, r.h) * short / Math.min(r.w, r.h));
      return { ratio: id, w: c.width, h: c.height };
    });
    setRows(want.map((w) => ({ ...w, status: "waiting" })));
    const project = await api<{ sequences: SequenceDoc[] }>(`/projects/${projectId}`).catch(() => ({ sequences: [] as SequenceDoc[] }));
    for (const [i, w] of want.entries()) {
      try {
        let sid = seq.id;
        if (!(w.w === comp.width && w.h === comp.height)) {
          const name = `${seq.name.replace(/ · \d+:\d+$/, "")} · ${w.ratio}`.slice(0, 200);
          let s = project.sequences.find((x) => x.name === name) ?? null;
          if (!s) s = await api<SequenceDoc>(`/projects/${projectId}/sequences`, { method: "POST", body: { name } });
          const tl = compileComposition(changeCanvas(comp, w.w, w.h, amap), amap, measure);
          await api(`/sequences/${s.id}`, { method: "PUT", body: { base_version: s.version, timeline: tl } });
          sid = s.id;
        }
        let e: ExportRec | null = null;
        for (let tries = 0; !e; tries++) {   // the server renders a few at a time per workspace: wait for a free slot
          try { e = await api<ExportRec>(`/sequences/${sid}/exports`, { method: "POST", body: { preset } }); }
          catch (x) {
            if (!(x instanceof ApiError && x.status === 429) || tries > 200 || !alive.current) throw x;
            setRows((rs) => rs.map((r, j) => (j === i ? { ...r, status: "waiting", error: "waiting for a free render slot" } : r)));
            await new Promise((res) => setTimeout(res, 3000));
          }
        }
        setRows((rs) => rs.map((r, j) => (j === i ? { ...r, seqId: sid, exportId: e.id, status: "rendering" } : r)));
      } catch (x) {
        setRows((rs) => rs.map((r, j) => (j === i ? { ...r, status: "failed", error: (x as Error).message } : r)));
      }
    }
    setBusy(false);
  }

  // poll the renders
  useEffect(() => {
    if (!rows.some((r) => r.status === "rendering")) return;
    const t = setInterval(async () => {
      const list = await api<ExportRec[]>(`/projects/${projectId}/exports`).catch(() => null);
      if (!list || !alive.current) return;
      setRows((rs) => rs.map((r) => {
        const rec = list.find((e) => e.id === r.exportId);
        if (!rec) return r;
        const st = rec.job.status === "succeeded" ? "done" : rec.job.status === "failed" || rec.job.status === "canceled" ? "failed" : "rendering";
        return { ...r, rec, status: st, error: st === "failed" ? rec.job.error ?? "Render failed" : undefined };
      }));
    }, 2000);
    return () => clearInterval(t);
  }, [rows, projectId]);

  // poll the ZIP
  useEffect(() => {
    if (!zip?.job || zip.url || zip.job.status === "failed") return;
    const t = setInterval(async () => {
      const r = await api<Job & { download_url: string | null }>(`/exports/zip/${zip.job!.id}`).catch(() => null);
      if (r && alive.current) setZip({ job: r, url: r.download_url });
    }, 1500);
    return () => clearInterval(t);
  }, [zip]);

  const done = rows.filter((r) => r.status === "done");
  return <div className="modal-back" onClick={onClose}>
    <div className="modal card sts-export" role="dialog" aria-label="Export Shorts" onClick={(e) => e.stopPropagation()}>
      <div className="row"><h3 className="grow" style={{ margin: 0 }}>Export</h3><button className="btn icon ghost" aria-label="Close" onClick={onClose}><X size={16} /></button></div>
      <p className="dim sm">MP4 (H.264 + AAC). Each shape gets its own copy of the layout, recalculated for that shape; your original stays as it is.</p>
      <div className="sts-h2">Shapes</div>
      <div className="sts-chips">{RATIOS.map((r) => <label key={r.id} className={`sts-ratio big ${pick.includes(r.id) ? "on" : ""}`}>
        <input type="checkbox" checked={pick.includes(r.id)} onChange={(e) => setPick((p) => e.target.checked ? [...p, r.id] : p.filter((x) => x !== r.id))} />
        <i style={{ aspectRatio: `${r.w}/${r.h}` }} />{r.label}{r.id === cur && <small>current</small>}</label>)}
        {cur === "custom" && <label className="sts-ratio big on"><input type="checkbox" checked={pick.includes("custom")} onChange={(e) => setPick((p) => e.target.checked ? [...p, "custom"] : p.filter((x) => x !== "custom"))} />
          {comp.width}×{comp.height}<small>current</small></label>}</div>
      <label className="sts-f"><span>Quality</span><select value={preset} onChange={(e) => setPreset(e.target.value)}>
        <option value="match">Full ({short}p)</option><option value="720p">720p</option><option value="draft">Draft 480p (fast)</option></select></label>
      <button className="btn sts-go" disabled={busy || !pick.length || rows.some((r) => r.status === "rendering")} onClick={start}>
        {busy ? <Loader2 size={14} className="spin" /> : <Download size={14} />}Render {pick.length} video{pick.length === 1 ? "" : "s"}</button>
      {rows.length > 0 && <div className="sts-xrows">{rows.map((r, i) => <div key={i} className="sts-xrow">
        <b>{r.ratio}</b><span className="dim">{r.w}×{r.h}</span>
        <span className="grow">{r.status === "rendering" ? <><Loader2 size={12} className="spin" /> {r.rec ? `${Math.round((r.rec.job.progress ?? 0) * 100)}% ${r.rec.job.stage ?? ""}` : "queued"}</> :
          r.status === "done" ? <><Check size={12} /> {fmtBytes(r.rec?.output_size_bytes ?? 0)}{r.rec?.validation && !r.rec.validation.ok ? " · check failed" : ""}</> :
          r.status === "failed" ? <span role="alert"><AlertTriangle size={12} /> {r.error}</span> : r.error ?? "waiting"}</span>
        {r.status === "done" && r.rec?.download_url && <a className="btn sm" href={r.rec.download_url} download>Download</a>}
      </div>)}</div>}
      {done.length > 1 && <div className="row" style={{ gap: 8 }}>
        <button className="btn sm" disabled={!!zip?.job && !zip.url} onClick={async () => {
          try { const j = await api<Job>("/exports/zip", { method: "POST", body: { export_ids: done.map((r) => r.exportId), name: "shorts" } }); setZip({ job: j }); }
          catch (e) { toast((e as Error).message); }
        }}><Package size={14} />Download all as ZIP</button>
        {zip?.job && !zip.url && <span className="dim sm"><Loader2 size={12} className="spin" /> packing…</span>}
        {zip?.url && <a className="btn sm sts-go" href={zip.url} download>ZIP ready — download</a>}
      </div>}
    </div>
  </div>;
}
