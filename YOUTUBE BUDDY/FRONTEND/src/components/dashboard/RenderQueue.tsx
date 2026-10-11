'use client';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { api } from '@/lib/api';
import { formatRelativeTime } from '@/lib/utils';
import { Loader2, X, RotateCcw, CheckCircle, AlertCircle, Clock } from 'lucide-react';
import toast from 'react-hot-toast';

type QueueJob = {
  id: number;
  type: 'short' | 'cinematic' | 'export';
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  created_at: string;
  error?: string | null;
};

const statusIcon = (status: QueueJob['status']) => {
  if (status === 'processing') return <Loader2 className="w-4 h-4 text-neon-cyan animate-spin" />;
  if (status === 'completed') return <CheckCircle className="w-4 h-4 text-neon-lime" />;
  if (status === 'failed') return <AlertCircle className="w-4 h-4 text-red-400" />;
  return <Clock className="w-4 h-4 text-white/30" />;
};

export function RenderQueue() {
  const [jobs, setJobs] = useState<QueueJob[]>([]);
  const [loading, setLoading] = useState(true);

  const loadJobs = async () => {
    try {
      const response = await api.renderQueue.list();
      setJobs(response.data.data || []);
    } catch {
      setJobs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadJobs();
  }, []);

  const cancelJob = async (id: number) => {
    try {
      await api.renderQueue.cancel(String(id));
      await loadJobs();
    } catch {
      toast.error('Unable to cancel render job.');
    }
  };

  const retryJob = async (id: number) => {
    try {
      await api.renderQueue.retry(String(id));
      await loadJobs();
    } catch {
      toast.error('Unable to retry render job.');
    }
  };

  const activeCount = jobs.filter((job) => job.status === 'processing' || job.status === 'pending').length;

  return (
    <div className="glass border border-white/8 rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/6">
        <div>
          <h3 className="font-display font-semibold text-white">Render Queue</h3>
          <p className="text-xs text-white/40 mt-0.5">{activeCount} jobs active</p>
        </div>
        <Badge variant="cyan" dot>Live</Badge>
      </div>

      <div className="divide-y divide-white/5">
        {loading ? (
          <div className="px-6 py-8 flex items-center gap-3 text-sm text-white/40">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading render jobs
          </div>
        ) : jobs.length === 0 ? (
          <div className="px-6 py-8 text-sm text-white/35">No render jobs yet.</div>
        ) : jobs.map((job) => (
          <div key={job.id} className="px-6 py-4 hover:bg-white/2 transition-colors">
            <div className="flex items-start gap-3">
              <div className="mt-0.5">{statusIcon(job.status)}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{job.type} render #{job.id}</p>
                <div className="flex items-center gap-3 mt-1">
                  <Badge variant="gray" size="sm">{job.type}</Badge>
                  <span className="text-xs text-white/30">{formatRelativeTime(job.created_at)}</span>
                </div>
                {job.status === 'processing' && (
                  <div className="mt-2.5">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-white/40">Progress</span>
                      <span className="text-xs text-neon-cyan font-mono">{job.progress}%</span>
                    </div>
                    <div className="h-1 bg-white/8 rounded-full overflow-hidden">
                      <div className="h-full bg-neon-cyan rounded-full transition-all duration-500" style={{ width: `${job.progress}%` }} />
                    </div>
                  </div>
                )}
                {job.error && <p className="text-xs text-red-400/80 mt-1.5">{job.error}</p>}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {job.status === 'failed' && (
                  <Button variant="ghost" size="sm" className="p-1.5" onClick={() => retryJob(job.id)}>
                    <RotateCcw className="w-3.5 h-3.5" />
                  </Button>
                )}
                {(job.status === 'pending' || job.status === 'processing') && (
                  <Button variant="ghost" size="sm" className="p-1.5 hover:text-red-400" onClick={() => cancelJob(job.id)}>
                    <X className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
