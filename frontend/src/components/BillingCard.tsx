import { FormEvent, useCallback, useEffect, useState } from "react";
import { Crown, Check, QrCode, Clock, XCircle, CheckCircle2 } from "lucide-react";
import { api } from "../api";
import { useAuth, useToast } from "../App";

type Plan = { id: string; name: string; price_inr: number; paid_runs: number | null; blurb: string };
type Pay = { id: string; plan: string; months: number; amount_inr: number; utr: string; status: "pending" | "approved" | "rejected"; note: string | null; created_at: string };
export type Billing = { plans: Plan[]; plan: string; plan_expires_at: string | null; paid_runs_per_day: number;
  upi: { upi_id: string | null; payee_name: string | null; qr_url: string | null; configured: boolean }; payments: Pay[]; is_platform_admin: boolean };

/** Plans & payment by UPI: scan the QR, pay, paste the 12-digit UTR; the plan switches on after the admin checks it. */
export default function BillingCard() {
  const { workspace } = useAuth();
  const toast = useToast();
  const [b, setB] = useState<Billing | null>(null);
  const [pick, setPick] = useState<string | null>(null), [months, setMonths] = useState(1), [utr, setUtr] = useState(""), [busy, setBusy] = useState(false);
  const canPay = workspace?.role === "owner" || workspace?.role === "admin";
  const load = useCallback(() => { if (workspace) api<Billing>(`/billing?workspace_id=${workspace.id}`).then(setB).catch(() => {}); }, [workspace]);
  useEffect(load, [load]);
  if (!b) return <section className="card" style={{ padding: 18 }} id="billing"><b>Plan &amp; billing</b><div className="spinner" style={{ marginTop: 10 }} /></section>;
  const chosen = b.plans.find((p) => p.id === pick);
  const upiLink = chosen && b.upi.upi_id ? `upi://pay?${new URLSearchParams({ pa: b.upi.upi_id, pn: b.upi.payee_name ?? "", am: String(chosen.price_inr * months), cu: "INR", tn: `${chosen.name} plan` })}` : null;

  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true);
    try {
      await api("/billing/payments", { method: "POST", body: { workspace_id: workspace!.id, plan: pick, months, utr } });
      toast("Payment submitted — your plan switches on as soon as it's verified (usually within a few hours)");
      setUtr(""); setPick(null); load();
    } catch (x) { toast((x as Error).message); } finally { setBusy(false); }
  }

  return (
    <section className="card bill" style={{ padding: 18 }} id="billing">
      <div className="row" style={{ marginBottom: 8 }}><Crown size={15} color="#fbbf24" /><b className="grow">Plan &amp; billing</b>
        <span className={`badge ${b.plan === "free" ? "" : "ok"}`}>{b.plans.find((p) => p.id === b.plan)?.name}</span></div>
      {b.plan_expires_at && <div className="dim" style={{ fontSize: 12 }}>Active until {new Date(b.plan_expires_at).toLocaleDateString()}</div>}
      <div className="dim" style={{ fontSize: 12, marginBottom: 10 }}>Premium AI generations today: up to {b.paid_runs_per_day} per day for this workspace.</div>
      <div className="bill-plans">
        {b.plans.map((p) => <button key={p.id} className={`bill-plan ${pick === p.id ? "on" : ""} ${b.plan === p.id ? "cur" : ""}`} disabled={p.id === "free" || !canPay}
          onClick={() => setPick(p.id)} aria-pressed={pick === p.id}>
          <b>{p.name}</b><span className="bill-price">{p.price_inr ? <>₹{p.price_inr}<small>/month</small></> : "Free"}</span>
          <span className="dim">{p.blurb}</span>{b.plan === p.id && <span className="badge ok"><Check size={10} />current</span>}</button>)}
      </div>
      {!canPay && <div className="dim" style={{ fontSize: 12, marginTop: 8 }}>Only the workspace owner or an admin can upgrade.</div>}
      {chosen && (!b.upi.configured ? <div className="error-box" style={{ marginTop: 12 }}>Payments aren't set up yet — the founder needs to add the UPI QR in Settings → Payments admin.</div> :
        <form className="bill-pay" onSubmit={submit}>
          <div className="bill-qr">{b.upi.qr_url ? <img src={b.upi.qr_url} alt="UPI QR code to pay" /> : <QrCode size={64} />}</div>
          <div className="grid" style={{ gap: 8 }}>
            <div style={{ fontSize: 13 }}>1. Pay <b>₹{chosen.price_inr * months}</b> by any UPI app (PhonePe, GPay, Paytm, BHIM){b.upi.payee_name ? <> to <b>{b.upi.payee_name}</b></> : null}.</div>
            {b.upi.upi_id && <div className="mono" style={{ fontSize: 12 }}>UPI ID: {b.upi.upi_id}</div>}
            {upiLink && <a className="btn sm" href={upiLink}>Open UPI app (on phone)</a>}
            <label style={{ fontSize: 12 }}>Months<select className="select" value={months} onChange={(e) => setMonths(+e.target.value)}>{[1, 3, 6, 12].map((m) => <option key={m} value={m}>{m} month{m > 1 ? "s" : ""} — ₹{chosen.price_inr * m}</option>)}</select></label>
            <label style={{ fontSize: 12 }}>2. Paste the 12-digit UPI transaction ID (UTR / UPI Ref No.)
              <input className="input" value={utr} onChange={(e) => setUtr(e.target.value)} inputMode="numeric" placeholder="e.g. 412345678901" maxLength={16} required /></label>
            <button className="btn primary" disabled={busy || utr.replace(/\s/g, "").length !== 12}>{busy ? <span className="spinner" /> : null}Submit for verification</button>
          </div>
        </form>)}
      {b.payments.length > 0 && <div style={{ marginTop: 12 }}>
        <div className="label">Payments</div>
        {b.payments.slice(0, 5).map((p) => <div key={p.id} className="gw-row" style={{ padding: "4px 0", fontSize: 12 }}>
          {p.status === "approved" ? <CheckCircle2 size={13} color="#4ade80" /> : p.status === "rejected" ? <XCircle size={13} color="#f87171" /> : <Clock size={13} color="#fbbf24" />}
          <span className="grow">{p.plan} · {p.months} mo · ₹{p.amount_inr} · UTR …{p.utr.slice(-4)}</span>
          <span className="badge" title={p.note ?? ""}>{p.status === "pending" ? "checking" : p.status}</span></div>)}
      </div>}
    </section>
  );
}
