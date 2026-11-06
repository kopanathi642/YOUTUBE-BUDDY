import { FormEvent, useEffect, useState } from "react";
import { Gift, Copy, MessageSquareHeart, BarChart3, Star } from "lucide-react";
import { api } from "../api";
import { useAuth, useToast } from "../App";

/** Invite friends: each friend who finishes their first export earns you 7 days of Creator (up to 12). */
export function InviteCard() {
  const { me } = useAuth();
  const toast = useToast();
  if (!me?.referral_code) return null;
  const link = `${location.origin}/signup?ref=${me.referral_code}`;
  const msg = `I edit my YouTube videos with this — Hindi dubbing, captions and Shorts in one place. Try it free: ${link}`;
  return (
    <section className="card" style={{ padding: 18 }} id="invite">
      <div className="row" style={{ marginBottom: 8 }}><Gift size={15} color="#f472b6" /><b>Invite creators, get Creator free</b></div>
      <div className="dim" style={{ fontSize: 12, marginBottom: 10 }}>When a friend signs up with your link and finishes their first export, you get 7 days of the Creator plan (up to 12 friends).</div>
      <div className="row" style={{ gap: 6 }}>
        <input className="input mono" readOnly value={link} aria-label="Your invite link" onFocus={(e) => e.target.select()} style={{ fontSize: 12 }} />
        <button className="btn sm" onClick={async () => { try { await navigator.clipboard.writeText(link); toast("Invite link copied"); } catch { toast("Select the link and copy it"); } }}><Copy size={13} />Copy</button>
      </div>
      <a className="btn sm" style={{ marginTop: 8 }} href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer noopener">Share on WhatsApp</a>
    </section>
  );
}

/** Small feedback form; lands in the founder's metrics card. */
export function FeedbackModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [msg, setMsg] = useState(""), [rating, setRating] = useState<number | null>(null), [busy, setBusy] = useState(false);
  async function send(e: FormEvent) {
    e.preventDefault(); setBusy(true);
    try { await api("/feedback", { method: "POST", body: { message: msg, page: location.pathname, rating } }); toast("Thank you — the founder reads every message"); onClose(); }
    catch (x) { toast((x as Error).message); setBusy(false); }
  }
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="card modal" role="dialog" aria-modal="true" aria-label="Send feedback" onSubmit={send}>
        <div className="row" style={{ marginBottom: 10 }}><MessageSquareHeart size={18} color="#f472b6" /><b className="grow" style={{ fontSize: 17 }}>What should we fix or add?</b></div>
        <div className="row" style={{ gap: 4, marginBottom: 8 }} role="radiogroup" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((n) => <button type="button" key={n} role="radio" aria-checked={rating === n} aria-label={`${n} stars`} className="btn icon ghost sm" onClick={() => setRating(n)}>
            <Star size={16} fill={rating && n <= rating ? "#fbbf24" : "none"} color="#fbbf24" /></button>)}
        </div>
        <textarea className="input" style={{ height: 110, padding: 10 }} value={msg} onChange={(e) => setMsg(e.target.value)} maxLength={2000} required placeholder="Anything — a bug, a missing tool, what you love…" aria-label="Feedback" />
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 12, gap: 8 }}>
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy || msg.trim().length < 3}>Send</button>
        </div>
      </form>
    </div>
  );
}

type Metrics = { users: number; signups_7d: number; active_1d: number; active_7d: number; active_30d: number; users_with_export: number; activation_rate: number;
  exports_7d: number; paying_workspaces: number; conversion_rate: number; revenue_30d_inr: number; pending_payments: number; referred_users: number;
  top_features_30d: { action: string; count: number }[]; signups_daily_30d: { day: string; count: number }[];
  feedback: { at: string; email: string | null; message: string; page: string; rating: number | null }[] };

/** Founder-only numbers that decide survival: activation, retention, conversion, revenue, and what users say. */
export function MetricsCard() {
  const [m, setM] = useState<Metrics | null>(null);
  useEffect(() => { api<Metrics>("/admin/metrics").then(setM).catch(() => {}); }, []);
  if (!m) return null;
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const tiles: [string, string | number, string][] = [
    ["Users", m.users, `+${m.signups_7d} this week`], ["Active (7 days)", m.active_7d, `${m.active_1d} today`],
    ["Activation", pct(m.activation_rate), `${m.users_with_export} finished an export`], ["Paying", m.paying_workspaces, `${pct(m.conversion_rate)} of users`],
    ["Revenue (30 days)", `₹${m.revenue_30d_inr}`, `${m.pending_payments} payments to check`], ["From invites", m.referred_users, `${m.exports_7d} exports this week`],
  ];
  const maxF = Math.max(1, ...m.top_features_30d.map((f) => f.count));
  return (
    <section className="card" style={{ padding: 18, gridColumn: "1 / -1" }} id="metrics">
      <div className="row" style={{ marginBottom: 10 }}><BarChart3 size={15} color="#60a5fa" /><b className="grow">Founder metrics</b><span className="badge">founder only</span></div>
      <div className="met-tiles">{tiles.map(([k, v, s]) => <div key={k} className="met-tile"><span className="dim">{k}</span><b>{v}</b><span className="dim">{s}</span></div>)}</div>
      <div className="met-cols">
        <div><div className="label">What people use (30 days)</div>
          {m.top_features_30d.length === 0 ? <div className="dim" style={{ fontSize: 12 }}>No activity yet.</div> :
            m.top_features_30d.map((f) => <div key={f.action} className="met-bar"><span className="ellipsis">{f.action}</span><i style={{ width: `${(f.count / maxF) * 100}%` }} /><b>{f.count}</b></div>)}</div>
        <div><div className="label">Latest feedback</div>
          {m.feedback.length === 0 ? <div className="dim" style={{ fontSize: 12 }}>No feedback yet — ask your first users directly.</div> :
            m.feedback.slice(0, 8).map((f, i) => <div key={i} className="met-fb"><span className="dim">{f.email ?? "user"} · {f.page} {f.rating ? "· " + "★".repeat(f.rating) : ""}</span><div>{f.message}</div></div>)}</div>
      </div>
    </section>
  );
}
