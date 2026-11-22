import { useState } from "react";
import { Asset } from "../api";

type Draft = { brief: string; videos: string[]; reveal: string; music?: string; bpm?: number };

export function AdDirector({ assets, disabled, create }: {
  assets: Asset[]; disabled: boolean; create: (ad: Draft) => Promise<void>;
}) {
  const [brief, setBrief] = useState("Create a cinematic 30-second advertisement with an emotional hook, elegant color grading and a final product reveal.");
  const [excluded, setExcluded] = useState<string[]>([]);
  const [reveal, setReveal] = useState("");
  const [music, setMusic] = useState("");
  const [tempo, setTempo] = useState("");
  const [busy, setBusy] = useState(false);
  const videos = assets.filter(a => a.kind === "video" && a.status === "ready" && a.duration_s);
  const selected = videos.filter(a => !excluded.includes(a.id));
  const last = selected.find(a => a.id === reveal) ?? selected[selected.length - 1];
  return <details className="panel" style={{padding: 12}}><summary><b>Director · Make a 30-second ad</b></summary>
    <form className="grid" style={{gap: 8, marginTop: 10}} onSubmit={async e => {
      e.preventDefault();
      if (!last || busy) return;
      setBusy(true);
      try { await create({brief, videos: selected.map(a => a.id), reveal: last.id,
        music: music || undefined, bpm: music && tempo ? Number(tempo) : undefined}); }
      finally { setBusy(false); }
    }}>
      <label>Creative brief<textarea className="input" value={brief} maxLength={1500} required onChange={e => setBrief(e.target.value)} /></label>
      <small>CPU draft uses scene boundaries and clip order. Include “fast” for quicker cuts or “cool” for a cooler grade.</small>
      <fieldset><legend>Footage</legend>{videos.map(a => <label key={a.id} style={{display: "block"}}>
        <input type="checkbox" checked={!excluded.includes(a.id)} onChange={e => setExcluded(e.target.checked ? excluded.filter(id => id !== a.id) : [...excluded, a.id])} /> {a.filename}
      </label>)}{!videos.length && <small>Upload video clips to the media bin first.</small>}</fieldset>
      <label>Final reveal<select className="input" value={last?.id ?? ""} onChange={e => setReveal(e.target.value)}>
        {selected.map(a => <option key={a.id} value={a.id}>{a.filename}</option>)}</select></label>
      <label>Music<select className="input" value={music} onChange={e => setMusic(e.target.value)}>
        <option value="">Use clip sound</option>{assets.filter(a => a.kind === "audio" && a.status === "ready" && (a.duration_s ?? 0) >= 30)
          .map(a => <option key={a.id} value={a.id}>{a.filename}</option>)}</select></label>
      {music && <label>Music tempo (BPM, optional; first beat at 0)<input className="input" type="number" min={40} max={240} value={tempo} onChange={e => setTempo(e.target.value)} /></label>}
      <small>Creates a separate sequence. Review the marked cuts, move clips, then export.</small>
      <button className="btn primary" disabled={busy || disabled || !brief.trim() || !last || selected.length > 40}>{busy ? "Creating draft…" : "Create editable ad"}</button>
    </form></details>;
}
