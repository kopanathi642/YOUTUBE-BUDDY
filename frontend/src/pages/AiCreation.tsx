import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Mic, Captions, Languages, Eraser, Crop, Sparkles, Image as ImageIcon, Clapperboard, Music, Brain, Bot, Boxes, Download, Lock, Activity } from "lucide-react";
import { api, Asset, Job, Project, timeAgo } from "../api";
import { useAuth, useToast } from "../App";
import UniverseShell from "../components/UniverseShell";
import { jobLabel } from "../components/GlobalBar";
import { universeById } from "../universes";
import { VoiceCatalog, waitJob } from "../editor/AiTools";

type Tool = "voice" | "transcribe" | "dub" | "bg" | "stabilize";
const TOOLS: { id: Tool; label: string; icon: any; desc: string }[] = [
  { id: "voice", label: "AI Voice", icon: Mic, desc: "Type a script, pick a voice, get a voice-over file in your project." },
  { id: "transcribe", label: "Transcribe & translate", icon: Captions, desc: "Speech to text with timestamps, translation and .srt subtitles." },
  { id: "dub", label: "AI Dubbing", icon: Languages, desc: "Translate speech and re-voice it, timed to the original." },
  { id: "bg", label: "Background removal", icon: Eraser, desc: "Cut the subject out of a video (transparent copy, clips ≤ 60 s)." },
  { id: "stabilize", label: "Stabilization", icon: Crop, desc: "Smooth shaky camera footage into a new copy." },
];
const ROADMAP = [
  { icon: ImageIcon, t: "Image generation", d: "Text-to-image & thumbnails from prompts — needs a GPU model provider." },
  { icon: Clapperboard, t: "Video generation", d: "Text/image-to-video clips — needs a licensed video-model provider." },
  { icon: Music, t: "Music & SFX generation", d: "Royalty-safe background music and effects." },
  { icon: Brain, t: "Director LLM", d: "Plans whole edits from a brief, using the tool registry with your approval." },
  { icon: Bot, t: "AI agents", d: "Multi-step creative workflows that run in the background." },
  { icon: Boxes, t: "Specialist tool library", d: "Grows release by release; each tool is listed only once it really works." },
];
const AI_KINDS = ["ai.tts", "ai.transcribe", "ai.translate", "ai.dub", "media.derive"];

const srtTime = (s: number) => { const ms = Math.round(s * 1000); return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`; };
const toSrt = (segs: { start: number; end: number; text: string }[]) => segs.map((s, i) => `${i + 1}\n${srtTime(s.start)} --> ${srtTime(s.end)}\n${s.text}\n`).join("\n");
const saveText = (name: string, text: string) => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" })); a.download = name; a.click(); };

export default function AiCreation() {
  const u = universeById("ai");
  const { workspace } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const tool = (params.get("tool") as Tool) || null;
  const [projects, setProjects] = useState<Project[]>([]);
  const [pid, setPid] = useState("");
  const [media, setMedia] = useState<Asset[]>([]);
  const [aid, setAid] = useState("");
  const [catalog, setCatalog] = useState<VoiceCatalog | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [text, setText] = useState(""), [voice, setVoice] = useState("en-female"), [lang, setLang] = useState("hi");
  const [result, setResult] = useState<Asset | null>(null);

  useEffect(() => { if (!workspace) return; api<Project[]>(`/workspaces/${workspace.id}/projects`).then((p) => { setProjects(p); setPid((x) => x || p[0]?.id || ""); }); api<VoiceCatalog>("/ai/voices").then(setCatalog).catch(() => {}); }, [workspace]);
  const loadMedia = useCallback(() => { if (pid) api<Asset[]>(`/projects/${pid}/media`).then(setMedia).catch(() => setMedia([])); }, [pid]);
  useEffect(() => { loadMedia(); setAid(""); setResult(null); }, [pid, loadMedia]);
  useEffect(() => {
    if (!workspace) return;
    const t = () => api<Job[]>(`/workspaces/${workspace.id}/jobs`).then((j) => setJobs(j.filter((x) => AI_KINDS.includes(x.kind)))).catch(() => {});
    t(); const i = setInterval(t, 3000); return () => clearInterval(i);
  }, [workspace]);

  const eligible = useMemo(() => media.filter((m) => m.status === "ready" && (tool === "bg" || tool === "stabilize" ? m.kind === "video" : m.has_audio)), [media, tool]);
  const sel = media.find((m) => m.id === aid);
  const langs = Object.entries(catalog?.languages ?? {});
  const voiceLangs = [...new Set((catalog?.voices ?? []).map((v) => v.language))];

  async function waitAsset(a: Asset) {
    setBusy("Working on the cloud worker…");
    for (;;) {
      const x = await api<Asset>(`/media/${a.id}`);
      if (x.job) setBusy(`${x.job.stage ?? "queued"} ${Math.round(x.job.progress * 100)}%`);
      if (x.status !== "processing") { setBusy(null); setResult(x); loadMedia(); if (x.status !== "ready") toast(`Failed: ${x.status_detail ?? x.job?.error}`); return; }
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  async function run() {
    setResult(null);
    try {
      if (tool === "voice") await waitAsset(await api<Asset>(`/projects/${pid}/ai/tts`, { method: "POST", body: { text, voice_id: voice } }));
      if (tool === "dub") await waitAsset(await api<Asset>(`/media/${aid}/dub`, { method: "POST", body: { target: lang } }));
      if (tool === "bg" || tool === "stabilize") await waitAsset(await api<Asset>(`/media/${aid}/derive`, { method: "POST", body: { op: tool === "bg" ? "remove_bg" : "stabilize" } }));
      if (tool === "transcribe") {
        setBusy("Transcribing…");
        const j = await api<Job>(`/media/${aid}/translate`, { method: "POST", body: { target: lang } });
        const done = await waitJob(j.id, (x) => setBusy(`${x.stage ?? "queued"} ${Math.round(x.progress * 100)}%`));
        setBusy(null); loadMedia();
        if (done.status !== "succeeded") toast(`Failed: ${done.error}`); else setResult(await api<Asset>(`/media/${aid}`));
      }
    } catch (e) { setBusy(null); toast((e as Error).message); }
  }

  const tr = result?.analysis?.transcript, trl = result?.analysis?.translations?.[lang];
  return (
    <UniverseShell u={u}>
      <div className="page-h"><div><h1>AI Creation Universe</h1><div className="muted">AI tools that run on your cloud worker today. Results land in your projects and the shared library.</div></div></div>
      <div className="ai-tools">{TOOLS.map((t) => (
        <button key={t.id} className={`ai-tool card ${tool === t.id ? "on" : ""}`} onClick={() => { setParams({ tool: t.id }); setResult(null); }}>
          <span className="ai-ti"><t.icon size={20} /></span><b>{t.label}</b><span className="dim" style={{ fontSize: 12 }}>{t.desc}</span></button>))}
      </div>
      {tool && <section className="card ai-work">
        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <label><span className="label">Project</span><select className="select" value={pid} onChange={(e) => setPid(e.target.value)}>{projects.length === 0 && <option value="">No projects yet</option>}{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          {tool !== "voice" && <label><span className="label">Media</span><select className="select" value={aid} onChange={(e) => { setAid(e.target.value); setResult(null); }}>
            <option value="">{eligible.length ? "Choose a file…" : "No suitable media in this project"}</option>{eligible.map((m) => <option key={m.id} value={m.id}>{m.filename}</option>)}</select></label>}
          {tool === "voice" && <>
            <label><span className="label">Voice</span><select className="select" value={voice} onChange={(e) => setVoice(e.target.value)}>{voiceLangs.map((l) => <optgroup key={l} label={catalog?.languages[l] ?? l}>{catalog!.voices.filter((v) => v.language === l).map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}</optgroup>)}</select></label>
            <label style={{ gridColumn: "1 / -1" }}><span className="label">Script</span><textarea className="notes" style={{ width: "100%", minHeight: 100 }} value={text} onChange={(e) => setText(e.target.value)} maxLength={3000} placeholder="Type what the voice should say…" /></label></>}
          {(tool === "dub" || tool === "transcribe") && <label><span className="label">{tool === "dub" ? "Dub into" : "Also translate to"}</span><select className="select" value={lang} onChange={(e) => setLang(e.target.value)}>
            {(tool === "dub" ? voiceLangs.map((l) => [l, catalog?.languages[l] ?? l]) : langs).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>}
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn primary" disabled={!!busy || !pid || (tool === "voice" ? !text.trim() : !aid)} onClick={run}>{busy ? <span className="spinner" /> : <Sparkles size={15} />}Run {TOOLS.find((t) => t.id === tool)!.label}</button>
          {busy && <span className="dim" style={{ fontSize: 13 }}>{busy}</span>}
        </div>
        {result && result.status === "ready" && result.proxy_url && result.kind === "audio" && <audio controls src={result.proxy_url} style={{ width: "100%", marginTop: 12 }} />}
        {result && result.status === "ready" && result.proxy_url && result.kind === "video" && <video controls src={result.proxy_url} className="ai-preview" />}
        {result && tool !== "transcribe" && result.status === "ready" && <div className="dim" style={{ fontSize: 12, marginTop: 6 }}>Saved as “{result.filename}” in {projects.find((p) => p.id === pid)?.name}.</div>}
        {tool === "transcribe" && tr && <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
          {[["Original (" + tr.language + ")", tr.segments, "original"], [catalog?.languages[lang] ?? lang, trl?.segments ?? [], lang]].map(([t, segs, n]: any) => (
            <div key={n}><div className="row"><b className="grow">{t}</b><button className="btn sm" onClick={() => saveText(`${sel?.filename ?? "captions"}.${n}.srt`, toSrt(segs))}><Download size={12} />.srt</button></div>
              <div className="transcript">{segs.map((s: any, i: number) => <div key={i}><span className="mono dim">{s.start.toFixed(1)}s</span> {s.text}</div>)}</div></div>))}
        </div>}
      </section>}
      <div className="grid" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1.2fr)", gap: 16, marginTop: 18, alignItems: "start" }} id="ai-cols">
        <section className="card" style={{ padding: 16 }}>
          <div className="row" style={{ marginBottom: 8 }}><Activity size={15} /><b>AI jobs</b></div>
          {jobs.length === 0 && <div className="dim" style={{ fontSize: 12.5 }}>AI jobs you start (here or in the editor) appear here with live status.</div>}
          {jobs.slice(0, 10).map((j) => <div key={j.id} className="gw-row"><span className="grow">{jobLabel(j.kind)}</span>
            {j.status === "running" ? <div className="progress" style={{ width: 80 }}><i style={{ width: `${Math.round(j.progress * 100)}%` }} /></div> : <span className={`badge ${j.status === "succeeded" ? "ok" : j.status === "failed" ? "err" : ""}`} title={j.error ?? ""}>{j.status}</span>}
            <span className="dim" style={{ fontSize: 11 }}>{timeAgo(j.created_at)}</span></div>)}
        </section>
        <section className="card" style={{ padding: 16 }}>
          <div className="row" style={{ marginBottom: 8 }}><Lock size={14} /><b>On the roadmap</b><span className="dim" style={{ fontSize: 11.5, marginLeft: 6 }}>not available yet — listed honestly, nothing here is clickable</span></div>
          <div className="roadmap">{ROADMAP.map((r) => <div key={r.t} className="rm"><r.icon size={18} /><div><b>{r.t}</b><div className="dim" style={{ fontSize: 11.5 }}>{r.d}</div></div></div>)}</div>
        </section>
      </div>
    </UniverseShell>
  );
}
