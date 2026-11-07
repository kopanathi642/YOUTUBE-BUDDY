import { useCallback, useEffect, useMemo, useState } from "react";
import { Languages, X, Plus, Download, Play, RotateCcw, Users, AlertTriangle, Check } from "lucide-react";
import { api, type Asset } from "../api";

/* Multilingual dubbing studio: auto-detect (or set) the source language, check the transcript and speakers, pick one or
   more target languages, edit translations and voices, render, then download MP4 / audio / SRT / VTT per language.
   Everything runs on our worker with pinned open models (see backend/app/speech). */

type Lang = { code: string; name: string };
type Voice = { id: string; label: string; gender: string; engine: string; licence: string };
type Langs = { sources: Lang[]; targets: (Lang & { voices: Voice[] })[]; pairs: Record<string, { ok: boolean; route: string }>; whisper: string; error?: string };
type Seg = { i: number; start: number; end: number; text: string; lang: string; lang_prob?: number; speaker: string };
type TSeg = { i: number; text: string; edited: boolean; from?: string };
type Report = { seconds: number; realtime_factor: number; peak_memory_mb: number; lines: number; lines_sped_up: number; max_speed: number; lines_overrunning: number; max_shift_s: number; cost_inr: number };
type Target = { status: string; error: string | null; revision: number; voices: Record<string, string>; notes: string[]; report: Report | null;
  files: Partial<Record<"mp4" | "audio_m4a" | "voice_wav" | "srt" | "vtt", string>>; asset_ids: Record<string, string>; segments?: TSeg[] };
type Dub = { id: string; source_asset_id: string; status: string; error: string | null; source_language: string | null; detected_language: string | null;
  detection: { language_prob?: number; mixed?: boolean; languages?: Record<string, number>; speaker_note?: string | null };
  speakers: Record<string, { label: string }>; version: number; segments: Seg[]; targets: Record<string, Target> };

const fmt = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, "0")}`;
const BUSY = new Set(["waiting", "queued", "rendering"]);

export default function DubStudio({ asset, onClose, onPlace, toast }: { asset: Asset; onClose: () => void; onPlace: (assetId: string) => void; toast: (m: string) => void }) {
  const [langs, setLangs] = useState<Langs | null>(null);
  const [dub, setDub] = useState<Dub | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [src, setSrc] = useState("auto");
  const [pick, setPick] = useState<string[]>(["hi"]);
  const [tab, setTab] = useState("transcript");
  const [edits, setEdits] = useState<Record<number, Partial<Seg>>>({});
  const [tEdits, setTEdits] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const name = (c: string | null | undefined) => (c && (langs?.targets.find((x) => x.code === c)?.name ?? langs?.sources.find((x) => x.code === c)?.name)) || c || "—";

  const refresh = useCallback(async (id?: string) => {
    const d = id ? await api<Dub>(`/dubs/${id}`) : null;
    if (d) setDub(d);
  }, []);
  useEffect(() => {
    api<Langs>("/dub/languages").then(setLangs).catch((e) => toast(e.message));
    api<{ id: string; source_asset_id: string }[]>(`/projects/${asset.project_id}/dubs`).then(async (ds) => {
      const mine = ds.find((d) => d.source_asset_id === asset.id);
      if (mine) await refresh(mine.id);
    }).catch(() => {}).finally(() => setLoaded(true));
  }, [asset, refresh, toast]);
  const polling = !!dub && (dub.status === "preparing" || Object.values(dub.targets).some((t) => BUSY.has(t.status)));
  useEffect(() => {
    if (!polling || !dub) return;
    const t = setInterval(() => refresh(dub.id).catch(() => {}), 2500);
    return () => clearInterval(t);
  }, [polling, dub, refresh]);
  useEffect(() => { setTEdits({}); }, [tab]);
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);

  const run = async (fn: () => Promise<Dub | void>, ok?: string) => {
    setBusy(true);
    try { const d = await fn(); if (d) setDub(d); if (ok) toast(ok); } catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };
  const create = () => run(() => api<Dub>(`/media/${asset.id}/dubs`, { method: "POST", body: { source_language: src === "auto" ? null : src, targets: pick } }));
  const saveTranscript = () => run(async () => {
    const segments = Object.entries(edits).map(([i, e]) => ({ i: +i, ...e }));
    const d = await api<Dub>(`/dubs/${dub!.id}`, { method: "PATCH", body: { version: dub!.version, segments } });
    setEdits({}); return d;
  }, "Transcript saved — translations of changed lines are being updated");
  const relang = (code: string) => run(() => api<Dub>(`/dubs/${dub!.id}`, { method: "PATCH", body: { version: dub!.version, source_language: code === "auto" ? null : code, redetect: code === "auto" } }),
    "Re-recognising the speech in the chosen language…");
  const renameSpk = (k: string, label: string) => run(() => api<Dub>(`/dubs/${dub!.id}`, { method: "PATCH", body: { version: dub!.version, speakers: { [k]: { label } } } }));
  const addLang = (code: string) => run(() => api<Dub>(`/dubs/${dub!.id}/targets`, { method: "POST", body: { languages: [code] } }));
  const removeLang = (code: string) => run(async () => { const d = await api<Dub>(`/dubs/${dub!.id}/targets/${code}`, { method: "DELETE" }); setTab("transcript"); return d; });
  const saveTarget = (lang: string, voices?: Record<string, string>) => run(async () => {
    const segments = Object.entries(tEdits).map(([i, text]) => ({ i: +i, text }));
    const d = await api<Dub>(`/dubs/${dub!.id}/targets/${lang}`, { method: "PATCH", body: { segments, ...(voices ? { voices } : {}) } });
    setTEdits({}); return d;
  });
  const render = (languages: string[]) => run(() => api<Dub>(`/dubs/${dub!.id}/render`, { method: "POST", body: { languages } }), `Dubbing ${languages.map(name).join(", ")} on the worker…`);

  const targets = langs?.targets ?? [];
  const pairOk = (s: string | null, t: string) => !s || langs?.pairs[`${s}>${t}`]?.ok;
  const srcNow = dub?.source_language ?? dub?.detected_language ?? null;
  const dirty = Object.keys(edits).length > 0;
  const tLangs = useMemo(() => Object.keys(dub?.targets ?? {}), [dub]);

  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="card modal dub-modal" role="dialog" aria-modal="true" aria-label="Dubbing studio">
        <div className="row"><Languages size={18} color="#c084fc" /><b className="grow" style={{ fontSize: 17 }}>Dubbing studio · {asset.filename}</b>
          <button className="btn icon ghost" aria-label="Close" onClick={onClose}><X size={16} /></button></div>
        {langs?.error && <div className="error-box">{langs.error}</div>}

        {!loaded || !langs ? <div className="spinner" style={{ margin: 30 }} /> : !dub ? (
          <div className="dub-setup">
            <label><span className="label">Spoken language</span>
              <select className="select" value={src} onChange={(e) => setSrc(e.target.value)} aria-label="Spoken language">
                <option value="auto">Detect automatically</option>
                {langs.sources.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}</select></label>
            <div><span className="label">Dub into (choose one or more)</span>
              <div className="dub-chips" role="group" aria-label="Target languages">
                {targets.map((t) => { const on = pick.includes(t.code), ok = pairOk(src === "auto" ? null : src, t.code);
                  return <button key={t.code} type="button" className={`chip ${on ? "on" : ""}`} aria-pressed={on} disabled={!ok}
                    title={ok ? `${t.voices.length} voice(s)` : langs.pairs[`${src}>${t.code}`]?.route}
                    onClick={() => setPick((p) => (on ? p.filter((x) => x !== t.code) : [...p, t.code]))}>{on && <Check size={12} />}{t.name}</button>; })}
              </div></div>
            <div className="dim" style={{ fontSize: 12 }}>Runs on our server with open models: no extra cost. Next you can check the transcript, speakers and translations before the voices are made.</div>
            <div className="row" style={{ justifyContent: "flex-end" }}><button className="btn primary" disabled={busy || !pick.length} onClick={create}>{busy ? <span className="spinner" /> : <Play size={14} />}Recognise speech</button></div>
          </div>
        ) : dub.status === "preparing" ? (
          <div className="dub-wait"><span className="spinner" /> Recognising speech, languages and speakers on the worker… (keeps running if you close this)</div>
        ) : dub.status === "failed" ? (
          <div className="error-box">{dub.error ?? "Speech recognition failed"} <button className="btn sm" onClick={() => relang("auto")}><RotateCcw size={12} />Try again</button></div>
        ) : (
          <>
            <div className="dub-head">
              <span>Spoken: <b>{name(srcNow)}</b>{!dub.source_language && dub.detection.language_prob != null && <span className="dim"> (detected, {Math.round(dub.detection.language_prob * 100)}%)</span>}</span>
              <select className="select sm" value={dub.source_language ?? "auto"} onChange={(e) => relang(e.target.value)} aria-label="Correct the spoken language">
                <option value="auto">Auto-detect</option>{langs.sources.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}</select>
              {dub.detection.mixed && <span className="badge warn" title="Lines in another language keep their own language and are translated from it"><AlertTriangle size={11} />Mixed: {Object.entries(dub.detection.languages ?? {}).map(([k, s]) => `${name(k)} ${Math.round(s)}s`).join(" · ")}</span>}
              <span className="grow" />
              <Users size={14} />{Object.entries(dub.speakers).map(([k, v]) => <input key={k} className="input sm spk" defaultValue={v.label} aria-label={`Name for ${k}`}
                onBlur={(e) => e.target.value !== v.label && renameSpk(k, e.target.value)} />)}
            </div>
            {dub.detection.speaker_note && <div className="dim" style={{ fontSize: 12 }}>{dub.detection.speaker_note}</div>}
            <div className="mini-tabs" role="tablist">
              <button role="tab" aria-selected={tab === "transcript"} className={tab === "transcript" ? "on" : ""} onClick={() => setTab("transcript")}>Transcript ({dub.segments.length})</button>
              {tLangs.map((l) => <button key={l} role="tab" aria-selected={tab === l} className={tab === l ? "on" : ""} onClick={() => setTab(l)}>
                {name(l)} <span className={`dot ${dub.targets[l].status}`} title={dub.targets[l].status} /></button>)}
              <select className="select sm" value="" onChange={(e) => e.target.value && addLang(e.target.value)} aria-label="Add a language">
                <option value="">+ Add language</option>{targets.filter((t) => !dub.targets[t.code] && pairOk(srcNow, t.code)).map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}</select>
              <span className="grow" />
              {tLangs.length > 1 && <button className="btn sm primary" disabled={busy || polling} onClick={() => render(tLangs.filter((l) => !BUSY.has(dub.targets[l].status)))}><Play size={12} />Dub all languages</button>}
            </div>

            {tab === "transcript" ? (
              <div className="dub-table" role="table" aria-label="Transcript">
                {dub.segments.map((s) => { const e = edits[s.i] ?? {}; return (
                  <div key={s.i} className="dub-row" role="row">
                    <span className="mono dim">{fmt(s.start)}</span>
                    <select className="select sm" value={e.speaker ?? s.speaker} aria-label={`Speaker of line ${s.i + 1}`} onChange={(x) => setEdits((m) => ({ ...m, [s.i]: { ...m[s.i], speaker: x.target.value } }))}>
                      {[...new Set([...Object.keys(dub.speakers), "S" + (Object.keys(dub.speakers).length + 1)])].map((k) => <option key={k} value={k}>{dub.speakers[k]?.label ?? `New speaker ${k.slice(1)}`}</option>)}</select>
                    <select className={`select sm ${s.lang !== srcNow ? "hl" : ""}`} value={e.lang ?? s.lang} aria-label={`Language of line ${s.i + 1}`} onChange={(x) => setEdits((m) => ({ ...m, [s.i]: { ...m[s.i], lang: x.target.value } }))}>
                      {[...new Set([s.lang, ...langs.sources.map((l) => l.code)])].map((c) => <option key={c} value={c}>{name(c)}</option>)}</select>
                    <textarea className="input sm" rows={1} value={e.text ?? s.text} aria-label={`Line ${s.i + 1}`} onChange={(x) => setEdits((m) => ({ ...m, [s.i]: { ...m[s.i], text: x.target.value } }))} />
                  </div>); })}
                <div className="row" style={{ justifyContent: "flex-end", marginTop: 8 }}>
                  {dirty && <button className="btn sm ghost" onClick={() => setEdits({})}>Discard</button>}
                  <button className="btn sm primary" disabled={!dirty || busy} onClick={saveTranscript}>Save transcript</button></div>
              </div>
            ) : (() => { const t = dub.targets[tab]; if (!t) return null; const tv = targets.find((x) => x.code === tab)?.voices ?? []; const tsegs = new Map((t.segments ?? []).map((s) => [s.i, s]));
              return (
                <div className="dub-target">
                  {t.status === "waiting" ? <div className="dub-wait"><span className="spinner" /> Translating…</div> : <>
                    <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
                      {Object.entries(dub.speakers).map(([k, v]) => <label key={k} className="row" style={{ gap: 6, fontSize: 12 }}>{v.label}
                        <select className="select sm" value={t.voices[k] ?? ""} aria-label={`Voice for ${v.label}`} onChange={(e) => saveTarget(tab, { ...t.voices, [k]: e.target.value })}>
                          {tv.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></label>)}
                      <span className="grow" />
                      <button className="btn sm ghost" onClick={() => removeLang(tab)}>Remove language</button>
                      <button className="btn sm primary" disabled={busy || BUSY.has(t.status)} onClick={() => render([tab])}>
                        {BUSY.has(t.status) ? <><span className="spinner" />{t.status === "rendering" ? "Dubbing…" : "Queued…"}</> : <><Play size={12} />{t.status === "done" ? "Dub again" : `Dub into ${name(tab)}`}</>}</button>
                    </div>
                    {t.notes.map((n) => <div key={n} className="badge warn" style={{ marginTop: 6 }}><AlertTriangle size={11} />{n}</div>)}
                    {t.error && <div className="error-box" style={{ marginTop: 8 }}>{t.error}</div>}
                    {t.status === "done" && t.report && (
                      <div className="dub-out">
                        <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
                          {t.files.mp4 && <a className="btn sm primary" href={t.files.mp4}><Download size={12} />Dubbed MP4</a>}
                          {t.files.audio_m4a && <a className="btn sm" href={t.files.audio_m4a}><Download size={12} />Audio (M4A)</a>}
                          {t.files.voice_wav && <a className="btn sm" href={t.files.voice_wav}><Download size={12} />Voice only (WAV)</a>}
                          {t.files.srt && <a className="btn sm" href={t.files.srt}><Download size={12} />SRT</a>}
                          {t.files.vtt && <a className="btn sm" href={t.files.vtt}><Download size={12} />VTT</a>}
                          {(t.asset_ids.mp4_asset || t.asset_ids.audio_asset) && <button className="btn sm ghost" onClick={() => onPlace(t.asset_ids.mp4_asset ?? t.asset_ids.audio_asset)}><Plus size={12} />Add to timeline</button>}
                        </div>
                        <div className="dim" style={{ fontSize: 11.5, marginTop: 6 }}>
                          Made in {t.report.seconds}s ({t.report.realtime_factor}× the clip length) · {t.report.lines} lines · {t.report.lines_sped_up} sped up (max {t.report.max_speed}×)
                          · {t.report.lines_overrunning} ran past their slot (max shift {t.report.max_shift_s}s) · cost ₹{t.report.cost_inr}</div>
                      </div>)}
                    <div className="dub-table" role="table" aria-label={`${name(tab)} translation`}>
                      {dub.segments.map((s) => { const ts = tsegs.get(s.i); if (!ts) return null; return (
                        <div key={s.i} className="dub-row tr" role="row">
                          <span className="mono dim">{fmt(s.start)}</span>
                          <span className="dim spk-name">{dub.speakers[s.speaker]?.label}</span>
                          <span className="dim src">{s.text}</span>
                          <textarea className={`input sm ${ts.edited ? "edited" : ""}`} rows={1} value={tEdits[s.i] ?? ts.text} aria-label={`${name(tab)} line ${s.i + 1}`}
                            onChange={(x) => setTEdits((m) => ({ ...m, [s.i]: x.target.value }))} />
                        </div>); })}
                    </div>
                    {Object.keys(tEdits).length > 0 && <div className="row" style={{ justifyContent: "flex-end", marginTop: 8 }}>
                      <button className="btn sm ghost" onClick={() => setTEdits({})}>Discard</button>
                      <button className="btn sm primary" disabled={busy} onClick={() => saveTarget(tab)}>Save translation</button></div>}
                  </>}
                </div>); })()}
          </>
        )}
      </div>
    </div>
  );
}
