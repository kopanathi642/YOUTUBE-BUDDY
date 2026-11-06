import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Search, Film, Music, ImageIcon } from "lucide-react";
import { api, Asset, fmtBytes, fmtDuration } from "../api";
import { useAuth } from "../App";
import UniverseShell from "../components/UniverseShell";

type LibAsset = Asset & { project_name: string };

export default function Library() {
  const { workspace } = useAuth();
  const [q, setQ] = useState(""), [kind, setKind] = useState("");
  const [items, setItems] = useState<LibAsset[] | null>(null);
  const [open, setOpen] = useState<LibAsset | null>(null);
  useEffect(() => {
    if (!workspace) return;
    const t = setTimeout(() => api<LibAsset[]>(`/workspaces/${workspace.id}/media?limit=120${q ? `&q=${encodeURIComponent(q)}` : ""}${kind ? `&kind=${kind}` : ""}`).then(setItems).catch(() => setItems([])), 200);
    return () => clearTimeout(t);
  }, [workspace, q, kind]);
  return (
    <UniverseShell u={null}>
      <div className="page-h"><div><h1>Shared asset library</h1><div className="muted">Every ready media file in {workspace?.name}, across all projects and universes.</div></div></div>
      <div className="row" style={{ marginBottom: 14, flexWrap: "wrap" }}>
        <div className="row" style={{ position: "relative", flex: "1 1 240px", maxWidth: 380 }}><Search size={15} className="dim" style={{ position: "absolute", left: 11 }} />
          <input className="input" style={{ paddingLeft: 32 }} placeholder="Search files" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search library" /></div>
        <div className="seg">{[["", "All"], ["video", "Video"], ["audio", "Audio"], ["image", "Images"]].map(([k, l]) => <button key={k} className={kind === k ? "on" : ""} onClick={() => setKind(k)}>{l}</button>)}</div>
      </div>
      {!items && <div className="proj-grid">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 170 }} />)}</div>}
      {items?.length === 0 && <div className="card empty">No media yet. Upload files inside a project in the Editor Universe.</div>}
      <div className="proj-grid">{items?.map((a) => (
        <button key={a.id} className="card lib-card" onClick={() => setOpen(a)}>
          <div className="proj-thumb">{a.thumbnail_url ? <img src={a.thumbnail_url} alt="" /> : a.kind === "audio" ? <Music size={30} color="#a78bfa" /> : a.kind === "image" && a.proxy_url ? <img src={a.proxy_url} alt="" /> : a.kind === "image" ? <ImageIcon size={30} /> : <Film size={30} />}</div>
          <div style={{ padding: "8px 10px", textAlign: "left" }}><div className="ellipsis" style={{ fontWeight: 600, fontSize: 13 }}>{a.filename}</div>
            <div className="dim" style={{ fontSize: 11.5 }}>{a.project_name} · {a.kind}{a.duration_s ? ` · ${fmtDuration(a.duration_s)}` : ""} · {fmtBytes(a.size_bytes)}</div></div>
        </button>))}</div>
      {open && <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && setOpen(null)}>
        <div className="card modal" role="dialog" aria-modal="true" aria-label={open.filename} style={{ width: "min(720px,100%)" }}>
          <b>{open.filename}</b><div className="dim" style={{ fontSize: 12, marginBottom: 10 }}>{open.project_name}{open.width ? ` · ${open.width}×${open.height}` : ""}</div>
          {open.kind === "video" && open.proxy_url && <video src={open.proxy_url} controls className="ai-preview" />}
          {open.kind === "audio" && open.proxy_url && <audio src={open.proxy_url} controls style={{ width: "100%" }} />}
          {open.kind === "image" && open.proxy_url && <img src={open.proxy_url} alt="" style={{ width: "100%", borderRadius: 10 }} />}
          <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}><button className="btn ghost" onClick={() => setOpen(null)}>Close</button><Link className="btn primary" to={`/edit/${open.project_id}`}>Open project in editor</Link></div>
        </div></div>}
    </UniverseShell>
  );
}
