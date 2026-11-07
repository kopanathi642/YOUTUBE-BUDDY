import { useEffect, useMemo, useRef, useState } from "react";
import { Circle, Square, RotateCcw, Upload, X, Video, Mic } from "lucide-react";

/** Record from the camera/microphone in the browser. Only starts after the user clicks and the browser grants permission. */
export default function RecordModal({ onClose, onDone }: { onClose: () => void; onDone: (f: File) => void }) {
  const live = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [mode, setMode] = useState<"video" | "audio">("video");
  const [rec, setRec] = useState<MediaRecorder | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [secs, setSecs] = useState(0);
  const [level, setLevel] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  // One preview URL per take. (Creating it during render made a new URL ~60×/s — the level meter re-renders every
  // frame — which leaked memory and reloaded the preview, so the buttons below kept jumping.)
  const preview = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  useEffect(() => {
    let st: MediaStream | null = null, raf = 0, ctx: AudioContext | null = null;
    (async () => {
      try {
        st = await navigator.mediaDevices.getUserMedia(mode === "video" ? { video: { width: 1280, height: 720 }, audio: true } : { audio: true });
        setStream(st);
        if (live.current && mode === "video") { live.current.srcObject = st; live.current.play().catch(() => {}); }
        ctx = new AudioContext();
        const an = ctx.createAnalyser(); an.fftSize = 512;
        ctx.createMediaStreamSource(st).connect(an);
        const buf = new Uint8Array(an.fftSize);
        const loop = () => { an.getByteTimeDomainData(buf); let m = 0; for (const v of buf) m = Math.max(m, Math.abs(v - 128)); setLevel(m / 128); raf = requestAnimationFrame(loop); };
        loop();
      } catch (e) { setErr((e as Error).name === "NotAllowedError" ? "Permission was denied. Allow camera/microphone access in your browser to record." : `Can't access the device: ${(e as Error).message}`); }
    })();
    return () => { cancelAnimationFrame(raf); st?.getTracks().forEach((t) => t.stop()); ctx?.close(); };
  }, [mode]);

  useEffect(() => { if (!rec) return; const t = setInterval(() => setSecs((s) => s + 1), 1000); return () => clearInterval(t); }, [rec]);

  function start() {
    if (!stream) return;
    const type = ["video/webm;codecs=vp9,opus", "video/webm", "audio/webm"].find((t) => MediaRecorder.isTypeSupported(t));
    const r = new MediaRecorder(stream, type ? { mimeType: mode === "audio" ? "audio/webm" : type } : undefined);
    const chunks: Blob[] = [];
    r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    r.onstop = () => setBlob(new Blob(chunks, { type: mode === "audio" ? "audio/webm" : "video/webm" }));
    r.start(1000); setRec(r); setSecs(0); setBlob(null);
  }
  const stop = () => { rec?.stop(); setRec(null); };
  const save = () => { if (!blob) return; const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-"); onDone(new File([blob], `Recording-${ts}.webm`, { type: blob.type })); };

  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && !rec && onClose()}>
      <div className="card modal" role="dialog" aria-modal="true" aria-label="Record" style={{ width: "min(560px,100%)" }}>
        <div className="row"><b className="grow" style={{ fontSize: 17 }}>Record</b>
          <div className="seg"><button className={mode === "video" ? "on" : ""} disabled={!!rec} onClick={() => setMode("video")}><Video size={13} /> Camera</button><button className={mode === "audio" ? "on" : ""} disabled={!!rec} onClick={() => setMode("audio")}><Mic size={13} /> Voice only</button></div>
          <button className="btn icon ghost" aria-label="Close" onClick={onClose} disabled={!!rec}><X size={16} /></button></div>
        {err ? <div className="error-box" style={{ marginTop: 12 }}>{err}</div> : <>
          {mode === "video" && <video ref={live} muted playsInline className="rec-live" />}
          {blob && <div className="dim" style={{ fontSize: 12, marginTop: 8 }}>Take ready: {secs}s · preview it below, retake, or add it to the project.</div>}
          {preview && (mode === "video" ? <video src={preview} controls className="rec-live" /> : <audio src={preview} controls style={{ width: "100%", marginTop: 8 }} />)}
          <div className="row" style={{ marginTop: 10 }}>
            <span className={`rec-dot ${rec ? "on" : ""}`} aria-hidden />{rec ? <b className="mono">REC {String(Math.floor(secs / 60)).padStart(2, "0")}:{String(secs % 60).padStart(2, "0")}</b> : <span className="dim" style={{ fontSize: 12 }}>Input level</span>}
            <div className="progress grow"><i style={{ width: `${Math.round(level * 100)}%`, background: level > 0.95 ? "var(--red)" : undefined }} /></div>
          </div>
          <div className="row" style={{ justifyContent: "flex-end", marginTop: 14 }}>
            {!rec && !blob && <button className="btn primary" onClick={start} disabled={!stream}><Circle size={14} fill="currentColor" />Start recording</button>}
            {rec && <button className="btn danger" onClick={stop}><Square size={14} fill="currentColor" />Stop</button>}
            {blob && !rec && <><button className="btn" onClick={() => { setBlob(null); setSecs(0); }}><RotateCcw size={14} />Retake</button>
              <button className="btn primary" onClick={save}><Upload size={14} />Add to project</button></>}
          </div>
        </>}
      </div>
    </div>
  );
}
