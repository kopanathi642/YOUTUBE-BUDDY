import { DragEvent, MutableRefObject, useEffect, useRef, useState } from "react";
import { Upload, Search, Film, Music, ImageIcon, X, RotateCcw, Trash2, Plus, AlertCircle, Video, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { LOOKS } from "../grade";
import { api, Asset, fmtBytes, fmtDuration } from "../api";
import { useToast } from "../App";
import { uploadFile, UploadState } from "../upload";
import TemplatesTab from "./Elements";
import StockTab from "./StockTab";
import { TitleTemplate } from "../templates";

const ACCEPT = ".mp4,.m4v,.mov,.webm,.mkv,.mp3,.wav,.m4a,.aac,.ogg,.flac,.png,.jpg,.jpeg,.webp";

export type BinTab = "media" | "effects" | "templates" | "stock" | "ai";
export default function MediaBin({ projectId, assets, setAssets, reload, readOnly, onAdd, uploadRef, onRecord, onLook, canLook, onTemplate, tabReq, hideStock }: {
  projectId: string; assets: Asset[]; setAssets: (f: (a: Asset[]) => Asset[]) => void; reload: () => void; readOnly: boolean;
  onAdd: (a: Asset) => void; fps: number; uploadRef: MutableRefObject<((f: File[]) => void) | null>; onRecord: () => void;
  onLook: (i: number) => void; canLook: boolean; onTemplate: (t: TitleTemplate) => void; tabReq?: { tab: BinTab; n: number } | null; hideStock?: boolean;
}) {
  const [binTab, setBinTab] = useState<BinTab>("media");
  useEffect(() => { if (tabReq) setBinTab(tabReq.tab); }, [tabReq]);
  const toast = useToast();
  const [uploads, setUploads] = useState<UploadState[]>([]);
  const ctrls = useRef(new Map<string, AbortController>());
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "video" | "audio" | "image">("all");
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  function start(files: FileList | File[]) {
    for (const file of Array.from(files)) {
      const key = `${file.name}-${file.size}-${Date.now()}-${Math.random()}`;
      const ctrl = new AbortController();
      ctrls.current.set(key, ctrl);
      setUploads((u) => [...u, { key, file, loaded: 0, total: file.size, status: "starting" }]);
      const upd = (s: Partial<UploadState>) => setUploads((u) => u.map((x) => (x.key === key ? { ...x, ...s } : x)));
      uploadFile(projectId, file, upd, ctrl.signal)
        .then((a) => { setAssets((xs) => [a, ...xs.filter((x) => x.id !== a.id)]); setUploads((u) => u.filter((x) => x.key !== key)); })
        .catch((e) => {
          if ((e as Error).name === "AbortError") { setUploads((u) => u.filter((x) => x.key !== key)); return; }
          upd({ status: "error", error: (e as Error).message });
        })
        .finally(() => ctrls.current.delete(key));
    }
  }

  useEffect(() => { uploadRef.current = (f) => { setBinTab("media"); start(f); }; });

  function onDrop(e: DragEvent) {
    e.preventDefault(); setOver(false);
    if (readOnly) return;
    if (e.dataTransfer.files.length) start(e.dataTransfer.files);
  }

  async function remove(a: Asset) {
    if (!confirm(`Remove "${a.filename}" from this project? Clips using it will show as missing.`)) return;
    try { await api(`/media/${a.id}`, { method: "DELETE" }); setAssets((xs) => xs.filter((x) => x.id !== a.id)); }
    catch (e) { toast((e as Error).message); }
  }
  async function retry(a: Asset) {
    try { await api(`/media/${a.id}/retry`, { method: "POST" }); reload(); } catch (e) { toast((e as Error).message); }
  }

  const shown = assets.filter((a) => a.kind !== "lut" && (filter === "all" || a.kind === filter) && a.filename.toLowerCase().includes(q.toLowerCase()));

  return (
    <section className={`ed-bin panel ${over ? "drop" : ""}`} aria-label="Media bin"
      onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setOver(true); } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false); }} onDrop={onDrop}>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={binTab === "media"} className={binTab === "media" ? "on" : ""} onClick={() => setBinTab("media")}>Media</button>
        <button role="tab" aria-selected={binTab === "effects"} className={binTab === "effects" ? "on" : ""} onClick={() => setBinTab("effects")}>Effects</button>
        <button role="tab" aria-selected={binTab === "templates"} className={binTab === "templates" ? "on" : ""} onClick={() => setBinTab("templates")}>Templates</button>
        {!hideStock && <button role="tab" aria-selected={binTab === "stock"} className={binTab === "stock" ? "on" : ""} onClick={() => setBinTab("stock")}>Stock</button>}
        <button role="tab" aria-selected={binTab === "ai"} className={binTab === "ai" ? "on" : ""} onClick={() => setBinTab("ai")}>AI Assets</button>
      </div>
      {binTab === "templates" ? <TemplatesTab projectId={projectId} readOnly={readOnly} onTemplate={onTemplate} onElement={onAdd} reload={reload} />
      : binTab === "stock" ? <StockTab projectId={projectId} readOnly={readOnly} onImported={onAdd} reload={reload} />
      : binTab === "ai" ? <div className="bin-list" style={{ paddingTop: 8 }}>
        {(() => { const gen = assets.filter((a) => a.kind !== "lut" && a.analysis?.generation); return gen.length === 0
          ? <div className="dim" style={{ fontSize: 12 }}>Files you create in the AI Generator for this project appear here, ready to drop on the timeline. <Link to="/ai-generator" style={{ color: "#c4b5fd" }}>Open AI Generator</Link></div>
          : <div className="bin-grid">{gen.map((a) => <button key={a.id} className="bin-item" disabled={readOnly || a.status !== "ready"} onClick={() => onAdd(a)} title={`${a.analysis.generation.tool_name ?? "AI"} · ${a.analysis.generation.model ?? "built-in"} — click to add`}>
              <span className="bin-thumb">{a.thumbnail_url ? <img src={a.thumbnail_url} alt="" /> : <Sparkles size={20} />}<span className="badge info" style={{ position: "absolute", top: 3, left: 3, fontSize: 9 }}>AI</span></span>
              <span className="ellipsis" style={{ fontSize: 11 }}>{a.filename}</span></button>)}</div>; })()}
      </div>
      : binTab === "effects" ? <div className="bin-list" style={{ paddingTop: 10 }}>
        <div className="dim" style={{ fontSize: 12, marginBottom: 8 }}>{canLook ? "Click a look to apply it to the selected clip." : "Select a video clip on the timeline, then pick a look."}</div>
        <div className="bin-grid">{LOOKS.map((l, i) => <button key={l.name} className="look" disabled={!canLook || readOnly} onClick={() => onLook(i)}><span className="look-ph" style={{ filter: `url(#look-${i})` }} /><span>{l.name}</span></button>)}</div>
      </div> : <>
      <div style={{ padding: 10, display: "grid", gap: 8 }}>
        <div className="row">
          <button className="btn primary grow" onClick={() => input.current?.click()} disabled={readOnly}><Upload size={15} />Import Media</button>
          <button className="btn" onClick={onRecord} disabled={readOnly} title="Record camera or voice"><Video size={15} />Record</button>
          <input ref={input} type="file" multiple accept={ACCEPT} hidden onChange={(e) => { if (e.target.files) start(e.target.files); e.target.value = ""; }} />
        </div>
        <div className="row" style={{ position: "relative" }}>
          <Search size={14} className="dim" style={{ position: "absolute", left: 10 }} />
          <input className="input" style={{ height: 32, paddingLeft: 30, fontSize: 13 }} placeholder="Search media" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search media" />
        </div>
        <div className="seg" role="group" aria-label="Media type" style={{ width: "100%" }}>
          {(["all", "video", "audio", "image"] as const).map((f) => <button key={f} className={filter === f ? "on" : ""} style={{ flex: 1 }} onClick={() => setFilter(f)}>{f[0].toUpperCase() + f.slice(1)}</button>)}
        </div>
      </div>
      <div className="bin-list">
        {uploads.map((u) => (
          <div key={u.key} className="bin-upload">
            <div className="row" style={{ fontSize: 12.5 }}>
              <span className="grow ellipsis">{u.file.name}</span>
              {u.status === "error" ? <span className="badge err">failed</span> : <span className="dim mono">{Math.round((u.loaded / u.total) * 100)}%</span>}
              <button className="btn icon ghost" style={{ width: 24, height: 24 }} aria-label="Cancel upload" onClick={() => { ctrls.current.get(u.key)?.abort(); setUploads((x) => x.filter((y) => y.key !== u.key)); }}><X size={13} /></button>
            </div>
            <div className="progress" style={{ marginTop: 6 }}><i style={{ width: `${(u.loaded / u.total) * 100}%` }} /></div>
            <div className="dim" style={{ fontSize: 11, marginTop: 4 }}>{u.status === "error" ? u.error : u.status === "finishing" ? "Finalising…" : `Uploading · ${fmtBytes(u.loaded)} of ${fmtBytes(u.total)}`}</div>
          </div>
        ))}
        {assets.length === 0 && uploads.length === 0 && (
          <div className="empty" style={{ padding: "30px 14px" }}>
            <Upload size={28} color="#a78bfa" />
            <div style={{ fontSize: 13 }}>Drag video, audio or images here, or use <b>Import media</b>.</div>
            <div className="dim" style={{ fontSize: 11.5 }}>MP4 · MOV · WebM · MKV · MP3 · WAV · M4A · PNG · JPG</div>
          </div>
        )}
        <div className="bin-grid">
          {shown.map((a) => (
            <div key={a.id} className={`bin-item ${a.status}`} draggable={a.status === "ready" && !readOnly}
              onDragStart={(e) => { e.dataTransfer.setData("application/x-cu-asset", a.id); e.dataTransfer.setData(`application/x-cu-kind-${a.kind}`, "1"); e.dataTransfer.effectAllowed = "copy"; }}
              onDoubleClick={() => a.status === "ready" && !readOnly && onAdd(a)} title={`${a.filename}\n${fmtBytes(a.size_bytes)}${a.width ? ` · ${a.width}×${a.height}` : ""}${a.fps ? ` · ${a.fps}fps` : ""}`}>
              <div className="bin-thumb">
                {a.thumbnail_url ? <img src={a.thumbnail_url} alt="" loading="lazy" /> : a.kind === "audio" ? <Music size={26} /> : a.kind === "image" && a.proxy_url ? <img src={a.proxy_url} alt="" loading="lazy" /> : a.kind === "image" ? <ImageIcon size={26} /> : <Film size={26} />}
                {a.status === "ready" && a.kind !== "image" && <span className="bin-dur mono">{fmtDuration(a.duration_s)}</span>}
                {a.status === "ready" && a.height && a.kind !== "image" && <span className="bin-res">{a.height >= 2160 ? "4K" : a.height >= 1080 ? "HD" : `${a.height}p`}</span>}
                {a.status === "processing" && <div className="bin-over"><span className="spinner" /><span>{a.job?.stage ?? "queued"} {a.job ? `${Math.round(a.job.progress * 100)}%` : ""}</span></div>}
                {(a.status === "failed" || a.status === "rejected") && <div className="bin-over err"><AlertCircle size={18} /><span>{a.status}</span></div>}
                {a.status === "ready" && !readOnly && <button className="bin-add" aria-label={`Add ${a.filename} to timeline`} onClick={() => onAdd(a)}><Plus size={14} /></button>}
              </div>
              <div className="row" style={{ padding: "5px 2px 0", gap: 4 }}>
                <span className="grow ellipsis" style={{ fontSize: 12 }}>{a.filename}</span>
                {a.status === "failed" && !readOnly && <button className="btn icon ghost" style={{ width: 22, height: 22 }} aria-label="Retry processing" title="Retry" onClick={() => retry(a)}><RotateCcw size={12} /></button>}
                {!readOnly && <button className="btn icon ghost bin-del" style={{ width: 22, height: 22 }} aria-label={`Remove ${a.filename}`} title="Remove" onClick={() => remove(a)}><Trash2 size={12} /></button>}
              </div>
              {a.status_detail && <div className="dim" style={{ fontSize: 10.5, padding: "0 2px" }}>{a.status_detail}</div>}
            </div>
          ))}
        </div>
      </div>
      </>}
    </section>
  );
}
