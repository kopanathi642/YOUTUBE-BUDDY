import { useCallback, useEffect, useState } from "react";
import { ShieldCheck, Upload, Check, X } from "lucide-react";
import { api } from "../api";
import { useToast } from "../App";

type Row = { id: string; plan: string; months: number; amount_inr: number; utr: string; status: string; created_at: string; user_email: string; user_name: string; workspace_name: string };

/** Founder-only: set the UPI QR and approve payments after checking them in the bank/UPI app. */
export default function AdminPayments() {
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>([]), [status, setStatus] = useState("pending");
  const [upi, setUpi] = useState(""), [payee, setPayee] = useState(""), [busy, setBusy] = useState(false);
  const load = useCallback(() => { api<{ payments: Row[] }>(`/admin/payments?status=${status}`).then((r) => setRows(r.payments)).catch(() => {}); }, [status]);
  useEffect(load, [load]);

  async function save(file?: File) {
    setBusy(true);
    try {
      let qr: string | undefined;
      if (file) {
        if (file.size > 2_000_000) throw new Error("QR image must be under 2 MB");
        qr = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(file); });
      }
      await api("/admin/billing/upi", { method: "PUT", body: { upi_id: upi || undefined, payee_name: payee || undefined, qr_data_url: qr } });
      toast(file ? "QR code saved — users now see it on the plan page" : "UPI details saved");
    } catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  }
  async function review(id: string, ok: boolean) {
    const note = ok ? undefined : window.prompt("Reason shown to the user (optional)") ?? undefined;
    try { await api(`/admin/payments/${id}/${ok ? "approve" : "reject"}`, { method: "POST", body: { note } }); toast(ok ? "Approved — plan is active" : "Rejected"); load(); }
    catch (e) { toast((e as Error).message); }
  }
  return (
    <section className="card" style={{ padding: 18 }} id="payments-admin">
      <div className="row" style={{ marginBottom: 8 }}><ShieldCheck size={15} color="#4ade80" /><b className="grow">Payments admin</b><span className="badge">founder only</span></div>
      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <input className="input" placeholder="UPI ID (e.g. name@ybl)" value={upi} onChange={(e) => setUpi(e.target.value)} aria-label="UPI ID" />
        <input className="input" placeholder="Payee name shown to users" value={payee} onChange={(e) => setPayee(e.target.value)} aria-label="Payee name" />
      </div>
      <div className="row" style={{ marginTop: 8, gap: 8 }}>
        <button className="btn sm" disabled={busy || (!upi && !payee)} onClick={() => save()}>Save details</button>
        <label className="btn sm"><Upload size={13} />Upload QR image<input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => e.target.files?.[0] && save(e.target.files[0])} /></label>
      </div>
      <div className="dim" style={{ fontSize: 11, marginTop: 6 }}>Tip: a PhonePe/Paytm <b>Business</b> QR is better than a personal one (higher limits, payment alerts). Approve only after the money shows in your UPI app with the same UTR.</div>
      <div className="row" style={{ marginTop: 12, gap: 6 }}>
        {["pending", "approved", "rejected", "all"].map((s) => <button key={s} className={`btn xs-text ${status === s ? "primary" : "ghost"} sm`} onClick={() => setStatus(s)}>{s}</button>)}
      </div>
      {rows.length === 0 ? <div className="dim" style={{ fontSize: 12, marginTop: 8 }}>No {status === "all" ? "" : status} payments.</div> :
        rows.map((r) => <div key={r.id} className="gw-row" style={{ padding: "6px 0", fontSize: 12, alignItems: "center" }}>
          <span className="grow"><b>₹{r.amount_inr}</b> · {r.plan} {r.months}mo · <span className="mono">{r.utr}</span><br /><span className="dim">{r.user_email} · {r.workspace_name} · {new Date(r.created_at).toLocaleString()}</span></span>
          {r.status === "pending" ? <><button className="btn sm primary" onClick={() => review(r.id, true)}><Check size={12} />Approve</button>
            <button className="btn sm ghost" onClick={() => review(r.id, false)}><X size={12} />Reject</button></> : <span className="badge">{r.status}</span>}
        </div>)}
    </section>
  );
}
