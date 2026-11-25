import { DragEvent, MutableRefObject, useEffect, useRef, useState } from "react";
import { Upload, Search, Film, Music, ImageIcon, X, RotateCcw, Trash2, Plus, AlertCircle, Video, Sparkles, Mic, Type } from "lucide-react";
import { Link } from "react-router-dom";
import { AssetCat, AssetCtx, AssetCategoryView, AudioFx, CategoryBar, ToolCards } from "./AssetLibrary";
import { api, Asset, fmtBytes, fmtDuration } from "../api";
import { useToast } from "../App";
import { fmtEta, fmtRate, localPreview, uploadFile, UploadState } from "../upload";
import TemplatesTab from "./Elements";
import StockTab from "./StockTab";
import Generators from "./Generators";
import { TitleTemplate } from "../templates";

const ACCEPT = ".mp4,.m4v,.mov,.webm,.mkv,.mp3,.wav,.m4a,.aac,.ogg,.flac,.png,.jpg,.jpeg,.webp";

/** Creative Assets Panel: category toolbar on top, then the category's subcategories and asset cards. */
export type BinTab = AssetCat | "stock" | "ai";
const AUDIO_SUBS = ["My audio", "Voice-over", "Audio effects", "AI audio"] as const;
export default function MediaBin({ projectId, assets, setAssets, reload, readOnly, onAdd, uploadRef, onRecord, onTTS, onTemplate, binTab, setBinTab, ctx, adjustments, hideStock, seqSize }: {
  projectId: string; assets: Asset[]; setAssets: (f: (a: Asset[]) => Asset[]) => void; reload: () => void; readOnly: boolean;
  onAdd: (a: Asset) => void; fps: number; uploadRef: MutableRefObject<((f: File[]) => void) | null>; onRecord: () => void; onTTS: () => void;
  onTemplate: (t: TitleTemplate) => void; binTab: BinTab; setBinTab: (tab: BinTab) => void; ctx: AssetCtx; adjustments: React.ReactNode; hideStock?: boolean; seqSize?: { w: number; h: number };
}) {
  const [audioSub, setAudioSub] = useState<typeof AUDIO_SUBS[number]>("My audio");
  const [gen, setGen] = useState(false);
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
      let preview: string | null = null;
      localPreview(file).then((p) => { preview = p; if (p) upd({ preview: p }); });
      uploadFile(projectId, file, upd, ctrl.signal)
        .then((a) => {
          // keep showing the local picture until the server thumbnail exists
          setAssets((xs) => [{ ...a, thumbnail_url: a.thumbnail_url ?? (a.kind !== "audio" ? preview : null) }, ...xs.filter((x) => x.id !== a.id)]);
          setUploads((u) => u.filter((x) => x.key !== key));
        })
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

  const audioOnly = binTab === "audio";
  const mediaType = audioOnly ? "audio" : filter;
  const shown = assets.filter((a) => a.kind !== "lut" && (mediaType === "all" || a.kind === mediaType) && a.filename.toLowerCase().includes(q.toLowerCase()));

  return (
    <section className={`ed-bin panel ${over ? "drop" : ""}`} aria-label="Media bin"
      onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setOver(true); } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false); }} onDrop={onDrop}>
      <CategoryBar value={binTab === "stock" || binTab === "ai" ? "media" : binTab} onChange={setBinTab} />
      {(binTab === "media" || binTab === "stock" || binTab === "ai") && <div className="ac-subs" role="tablist" aria-label="Media sources">
        {([["media", "My media"], ...(!hideStock ? [["stock", "Stock"]] : []), ["ai", "AI files"]] as [BinTab, string][]).map(([k, l]) =>
          <button key={k} role="tab" aria-selected={binTab === k} className={binTab === k ? "on" : ""} onClick={() => setBinTab(k)}>{l}</button>)}
      </div>}
      {binTab === "audio" && <div className="ac-subs" role="tablist" aria-label="Audio">
        {AUDIO_SUBS.map((k) => <button key={k} role="tab" aria-selected={audioSub === k} className={audioSub === k ? "on" : ""} onClick={() => setAudioSub(k)}>{k}</button>)}
      </div>}
      {binTab === "stock" ? <StockTab projectId={projectId} readOnly={readOnly} onImported={onAdd} reload={reload} />
      : binTab === "audio" && audioSub === "Voice-over" ? <div className="bin-list ac-body"><div className="ac-grid">
          <button className="ac-card" disabled={readOnly} onClick={onTTS}><span className="ac-prev"><Type size={22} /></span><span className="ac-name">Text to speech</span><span className="ac-kind">Free AI voices · many languages</span></button>
          <button className="ac-card" disabled={readOnly} onClick={onRecord}><span className="ac-prev"><Mic size={22} /></span><span className="ac-name">Record voice</span><span className="ac-kind">Your microphone</span></button>
        </div></div>
      : binTab === "audio" && audioSub === "Audio effects" ? <div className="bin-list ac-body"><AudioFx c={ctx} /></div>
      : binTab === "audio" && audioSub === "AI audio" ? <div className="bin-list ac-body"><ToolCards c={ctx} ids={["047", "048", "049", "050", "041", "042", "043", "044", "046", "045"]} /></div>
      : binTab === "ai" ? <div className="bin-list" style={{ paddingTop: 8 }}>
        {(() => { const gen = assets.filter((a) => a.kind !== "lut" && a.analysis?.generation); return gen.length === 0
          ? <div className="dim" style={{ fontSize: 12 }}>Files you make with AI tools for this project appear here, ready to drop on the timeline. Try <b>AI Tools</b> above, or the <Link to="/ai-generator" style={{ color: "#c4b5fd" }}>AI Generator</Link>.</div>
          : <div className="bin-grid">{gen.map((a) => <button key={a.id} className="bin-item" disabled={readOnly || a.status !== "ready"} onClick={() => onAdd(a)} title={`${a.analysis.generation.tool_name ?? "AI"} · ${a.analysis.generation.model ?? "built-in"} — click to add`}>
              <span className="bin-thumb">{a.thumbnail_url ? <img src={a.thumbnail_url} alt="" /> : <Sparkles size={20} />}<span className="badge info" style={{ position: "absolute", top: 3, left: 3, fontSize: 9 }}>AI</span></span>
              <span className="ellipsis" style={{ fontSize: 11 }}>{a.filename}</span></button>)}</div>; })()}
      </div>
      : binTab !== "media" && binTab !== "audio" ? <AssetCategoryView cat={binTab} c={ctx} adjustments={adjustments}
          frames={<TemplatesTab section="overlays" projectId={projectId} readOnly={readOnly} onTemplate={onTemplate} onElement={onAdd} reload={reload} />}
          stickers={<TemplatesTab section="stickers" projectId={projectId} readOnly={readOnly} onTemplate={onTemplate} onElement={onAdd} reload={reload} />}
          elements={<TemplatesTab section="elements" projectId={projectId} readOnly={readOnly} onTemplate={onTemplate} onElement={onAdd} reload={reload} />}
          templates={<TemplatesTab section="templates" projectId={projectId} readOnly={readOnly} onTemplate={onTemplate} onElement={onAdd} reload={reload} />}
          backgrounds={<div style={{ padding: "4px 0" }}><div className="dim" style={{ fontSize: 12, marginBottom: 8 }}>Pick a background; it's added to your media, then click it to place it on the timeline.</div>
            <Generators projectId={projectId} size={seqSize ?? { w: 1920, h: 1080 }} readOnly={readOnly}
              onCreated={(a) => { setAssets((xs) => [a, ...xs.filter((x) => x.id !== a.id)]); setTimeout(reload, 1500); setBinTab("media"); }} /></div>} />
      : <>
      <div style={{ padding: 10, display: "grid", gap: 8 }}>
        <div className="row bin-actions">
          <button className="btn primary grow" onClick={() => input.current?.click()} disabled={readOnly}><Upload size={15} />{audioOnly ? "Import audio" : "Import Media"}</button>
          <button className="btn" onClick={onRecord} disabled={readOnly} title="Record camera or voice"><Video size={15} />Record</button>
          {!audioOnly && <button className={`btn ${gen ? "toggled" : ""}`} onClick={() => setGen((x) => !x)} disabled={readOnly} aria-expanded={gen} title="Generators: solid colour, gradients, bars, grid, paper…"><Sparkles size={15} /><span className="bin-gen-l">Generate</span></button>}
          <input ref={input} type="file" multiple accept={audioOnly ? ".mp3,.wav,.m4a,.aac,.ogg,.flac" : ACCEPT} hidden onChange={(e) => { if (e.target.files) start(e.target.files); e.target.value = ""; }} />
        </div>
        {!audioOnly && gen && <Generators projectId={projectId} size={seqSize ?? { w: 1920, h: 1080 }} readOnly={readOnly}
          onCreated={(a) => { setAssets((xs) => [a, ...xs.filter((x) => x.id !== a.id)]); setTimeout(reload, 1500); setGen(false); }} />}
        <div className="row" style={{ position: "relative" }}>
          <Search size={14} className="dim" style={{ position: "absolute", left: 10 }} />
          <input className="input" style={{ height: 32, paddingLeft: 30, fontSize: 13 }} placeholder="Search media" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search media" />
        </div>
        {!audioOnly && <div className="seg" role="group" aria-label="Media type" style={{ width: "100%" }}>
          {(["all", "video", "audio", "image"] as const).map((f) => <button key={f} className={filter === f ? "on" : ""} style={{ flex: 1 }} onClick={() => setFilter(f)}>{f[0].toUpperCase() + f.slice(1)}</button>)}
        </div>}
      </div>
      <div className="bin-list">
        {uploads.map((u) => (
          <div key={u.key} className="bin-upload">
            <div className="row" style={{ fontSize: 12.5 }}>
              {u.preview ? <img className="up-thumb" src={u.preview} alt="" /> : <span className="up-thumb ph">{u.file.type.startsWith("audio") ? <Music size={14} /> : <Film size={14} />}</span>}
              <span className="grow ellipsis">{u.file.name}</span>
              {u.status === "error" ? <span className="badge err">failed</span> : <span className="dim mono">{Math.round((u.loaded / u.total) * 100)}%</span>}
              <button className="btn icon ghost" style={{ width: 24, height: 24 }} aria-label="Cancel upload" onClick={() => { ctrls.current.get(u.key)?.abort(); setUploads((x) => x.filter((y) => y.key !== u.key)); }}><X size={13} /></button>
            </div>
            <div className="progress" style={{ marginTop: 6 }}><i style={{ width: `${(u.loaded / u.total) * 100}%` }} /></div>
            <div className="dim" style={{ fontSize: 11, marginTop: 4 }}>{u.status === "error" ? u.error : u.status === "finishing" ? "Finalising…" : `Uploading · ${fmtBytes(u.loaded)} of ${fmtBytes(u.total)}${u.rate ? ` · ${fmtRate(u.rate)} · ${fmtEta(u.total - u.loaded, u.rate)}` : ""}`}</div>
          </div>
        ))}
        {audioOnly && !shown.length && !uploads.length && <p className="dim">No matching audio. Import an audio file to add it to your timeline.</p>}
        {!audioOnly && assets.length === 0 && uploads.length === 0 && (
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
