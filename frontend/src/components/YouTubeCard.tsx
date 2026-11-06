import { useCallback, useEffect, useState } from "react";
import { Youtube, Link2, Unlink } from "lucide-react";
import { api } from "../api";
import { useToast } from "../App";

export type YtStatus = { configured: boolean; missing: string[]; connected: boolean; channel_title: string | null; redirect_uri: string };
const MSG: Record<string, string> = { connected: "YouTube channel connected", denied: "YouTube connection was cancelled", bad_state: "That YouTube sign-in link expired — try again",
  no_refresh: "Google didn't grant offline access — remove the app at myaccount.google.com/permissions and connect again", failed: "Couldn't connect YouTube — try again" };

export default function YouTubeCard({ admin }: { admin: boolean }) {
  const toast = useToast();
  const [s, setS] = useState<YtStatus | null>(null), [busy, setBusy] = useState(false);
  const load = useCallback(() => api<YtStatus>("/youtube/status").then(setS).catch(() => {}), []);
  useEffect(() => {
    load();
    const r = new URLSearchParams(location.search).get("youtube");
    if (r && MSG[r]) { toast(MSG[r]); history.replaceState(null, "", location.pathname); }
  }, [load]); // eslint-disable-line react-hooks/exhaustive-deps
  async function connect() {
    setBusy(true);
    try { const { url } = await api<{ url: string }>("/youtube/connect"); location.assign(url); }
    catch (e) { toast((e as Error).message); setBusy(false); }
  }
  async function disconnect() {
    setBusy(true);
    try { await api("/youtube/connection", { method: "DELETE" }); toast("YouTube disconnected"); load(); } catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  }
  if (s && !s.configured && !admin) return null;   // hidden for users until the founder sets it up
  return (
    <section className="card" style={{ padding: 18 }} id="youtube">
      <div className="row" style={{ marginBottom: 8 }}><Youtube size={16} color="#f87171" /><b className="grow">YouTube publishing</b>
        {s?.connected && <span className="badge ok">connected</span>}</div>
      {!s ? <div className="spinner" /> : !s.configured ? <div style={{ fontSize: 12 }}>
        <div className="dim">Not set up on this server yet. It's free: create an OAuth client in Google Cloud (YouTube Data API v3) and add these to the server's environment settings:</div>
        <div className="mono" style={{ marginTop: 6 }}>{s.missing.join(", ")}</div>
        <div className="dim" style={{ marginTop: 6 }}>Authorised redirect URI: <span className="mono">{s.redirect_uri}</span></div>
      </div> : s.connected ? <>
        <div className="gb-kv"><span>Channel</span><b>{s.channel_title}</b></div>
        <div className="dim" style={{ fontSize: 12, margin: "6px 0 10px" }}>Publish any finished export from the editor's Export queue (YouTube button).</div>
        <button className="btn sm" onClick={disconnect} disabled={busy}><Unlink size={13} />Disconnect</button>
      </> : <>
        <div className="dim" style={{ fontSize: 12, marginBottom: 10 }}>Sign in with Google and allow uploads. We store an encrypted access key, never your password.</div>
        <button className="btn primary" onClick={connect} disabled={busy}><Link2 size={14} />Connect YouTube channel</button>
      </>}
    </section>
  );
}
