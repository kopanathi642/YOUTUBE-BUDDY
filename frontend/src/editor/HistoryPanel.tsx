import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { api, SequenceDoc, timeAgo } from "../api";
import { useToast } from "../App";

export default function HistoryPanel({ sequenceId, current, readOnly, onRestored }: {
  sequenceId: string; current: number; readOnly: boolean; onRestored: (s: SequenceDoc) => void;
}) {
  const toast = useToast();
  const [rows, setRows] = useState<{ version: number; created_at: string; saved_by: string | null }[] | null>(null);
  useEffect(() => { api(`/sequences/${sequenceId}/versions`).then(setRows).catch((e) => toast((e as Error).message)); }, [sequenceId, current, toast]);
  return (
    <div className="insp-sec">
      <div className="row" style={{ marginBottom: 6 }}><History size={15} /><b>Version history</b></div>
      <div className="dim" style={{ fontSize: 11.5, marginBottom: 10 }}>Every autosave is kept. Restoring creates a new version, so nothing is lost.</div>
      {!rows && <div className="skeleton" style={{ height: 80 }} />}
      <div className="grid" style={{ gap: 4 }}>
        {rows?.map((r) => (
          <div key={r.version} className="row hist-row">
            <span className="mono" style={{ width: 44 }}>v{r.version}</span>
            <span className="grow dim" style={{ fontSize: 12 }}>{timeAgo(r.created_at)}{r.saved_by ? ` · ${r.saved_by}` : ""}</span>
            {r.version === current ? <span className="badge ok">current</span>
              : !readOnly && <button className="btn sm ghost" onClick={async () => {
                if (!confirm(`Restore version ${r.version}? Your current state stays in history.`)) return;
                try { onRestored(await api<SequenceDoc>(`/sequences/${sequenceId}/restore`, { method: "POST", body: { version: r.version } })); }
                catch (e) { toast((e as Error).message); }
              }}>Restore</button>}
          </div>
        ))}
      </div>
    </div>
  );
}
