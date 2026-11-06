import { useEffect, useState } from "react";
import { Youtube, X, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { api, Job } from "../api";
import type { YtStatus } from "../components/YouTubeCard";

/** Publish one finished export to the user's linked YouTube channel (private by default). */
export default function PublishModal({ exportId, defaultTitle, onClose }: { exportId: string; defaultTitle: string; onClose: () => void }) {
  const [st, setSt] = useState<YtStatus | null>(null);
  const [title, setTitle] = useState(defaultTitle), [desc, setDesc] = useState(""), [tags, setTags] = useState("");
  const [privacy, setPrivacy] = useState("private"), [kids, setKids] = useState(false), [ai, setAi] = useState(false);
  const [job, setJob] = useState<Job | null>(null), [err, setErr] = useState<string | null>(null), [busy, setBusy] = useState(false);
  useEffect(() => {
    api<YtStatus>("/youtube/status").then(setSt).catch(() => {});
    api<Job[]>(`/exports/${exportId}/youtube`).then((h) => h[0] && setJob(h[0])).catch(() => {});
  }, [exportId]);
  const live = job && (job.status === "queued" || job.status === "running");
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => api<Job>(`/jobs/${job!.id}`).then(setJob).catch(() => {}), 1500);
    return () => clearInterval(t);
  }, [live, job?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function go() {
    setBusy(true); setErr(null);
    try {
      const t = tags.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 30);
      setJob(await api<Job>(`/exports/${exportId}/youtube`, { method: "POST", body: { title, description: desc, tags: t, privacy, made_for_kids: kids, ai_altered: ai } }));
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="card modal" role="dialog" aria-modal="true" aria-label="Publish to YouTube" style={{ width: "min(520px,100%)" }}>
        <div className="row"><Youtube size={18} color="#f87171" /><b className="grow" style={{ fontSize: 17 }}>Publish to YouTube</b>
          <button className="btn icon ghost" aria-label="Close" onClick={onClose}><X size={16} /></button></div>
        {!st ? <div className="spinner" style={{ marginTop: 12 }} /> : !st.configured || !st.connected ? <div className="empty" style={{ marginTop: 12 }}>
          {!st.configured ? "YouTube publishing isn't set up on this server yet." : "Connect your YouTube channel first."} <Link to="/settings#youtube" style={{ color: "#c4b5fd" }}>Open Settings</Link></div> : <>
          <div className="dim" style={{ fontSize: 12, margin: "6px 0 10px" }}>Channel: <b>{st.channel_title}</b></div>
          <div className="grid" style={{ gap: 8 }}>
            <label><span className="label">Title</span><input className="input" value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} /></label>
            <label><span className="label">Description</span><textarea className="input" style={{ height: 80, padding: 8 }} maxLength={5000} value={desc} onChange={(e) => setDesc(e.target.value)} /></label>
            <label><span className="label">Tags (comma separated)</span><input className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="vlog, travel, goa" /></label>
            <label><span className="label">Visibility</span><select className="select" value={privacy} onChange={(e) => setPrivacy(e.target.value)}>
              <option value="private">Private (only you)</option><option value="unlisted">Unlisted (anyone with the link)</option><option value="public">Public</option></select></label>
            <label className="check" style={{ fontSize: 12 }}><input type="checkbox" checked={kids} onChange={(e) => setKids(e.target.checked)} />Made for kids (required by YouTube/COPPA)</label>
            <label className="check" style={{ fontSize: 12 }}><input type="checkbox" checked={ai} onChange={(e) => setAi(e.target.checked)} />Contains realistic AI-generated or altered content</label>
          </div>
          {err && <div className="error-box" style={{ marginTop: 10 }}>{err}</div>}
          {job && <div style={{ marginTop: 10, fontSize: 13 }}>
            {live && <div className="row"><span className="spinner" />{job.stage ?? "queued"} · {Math.round(job.progress * 100)}%</div>}
            {job.status === "succeeded" && <a className="btn sm" href={job.result.url} target="_blank" rel="noreferrer noopener"><ExternalLink size={13} />Published ({job.result.privacy}) — open on YouTube</a>}
            {job.status === "failed" && <div className="error-box">{job.error}</div>}
          </div>}
          <div className="dim" style={{ fontSize: 11, marginTop: 10 }}>Until the Google app passes YouTube's audit, YouTube keeps uploads from it private — you can change visibility in YouTube Studio.</div>
          <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
            <button className="btn primary" onClick={go} disabled={busy || !!live || !title.trim()}><Youtube size={15} />{job?.status === "succeeded" ? "Publish again" : "Publish"}</button>
          </div>
        </>}
      </div>
    </div>
  );
}
