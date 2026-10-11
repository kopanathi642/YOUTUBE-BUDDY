'use client';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/Badge';
import { formatRelativeTime } from '@/lib/utils';
import { api } from '@/lib/api';
import { TrendingUp, FileText, Search, Scissors, Upload, Image as ImageIcon, Loader2, Sparkles } from 'lucide-react';

type AgentActivityItem = {
  id: number;
  agent_name: string;
  prompt?: string | null;
  output?: unknown;
  status: 'pending' | 'running' | 'processing' | 'completed' | 'failed';
  created_at: string;
};

const iconMap = {
  trend: TrendingUp,
  script: FileText,
  seo: Search,
  shorts: Scissors,
  upload: Upload,
  thumbnail: ImageIcon,
};

const statusVariant: Record<string, 'lime' | 'cyan' | 'red' | 'yellow' | 'gray'> = {
  completed: 'lime',
  running: 'cyan',
  processing: 'cyan',
  pending: 'yellow',
  failed: 'red',
  idle: 'gray',
};

const formatOutput = (output: unknown, prompt?: string | null) => {
  if (!output) return prompt || 'Agent run recorded';
  if (typeof output === 'string') return output;
  if (typeof output === 'object') {
    const data = output as Record<string, unknown>;
    const summary = data.summary || data.title || data.message || data.status;
    if (summary) return String(summary);
    return JSON.stringify(data);
  }
  return String(output);
};

export function AgentActivity() {
  const [activities, setActivities] = useState<AgentActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    api.agents.history()
      .then((response) => {
        if (active) setActivities(response.data || []);
      })
      .catch(() => {
        if (active) setActivities([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="glass border border-white/8 rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/6">
        <div>
          <h3 className="font-display font-semibold text-white">AI Agent Activity</h3>
          <p className="text-xs text-white/40 mt-0.5">Runs from your backend agent history</p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 bg-neon-lime rounded-full" />
          <span className="text-xs text-white/40">Live</span>
        </div>
      </div>

      <div className="divide-y divide-white/5">
        {loading ? (
          <div className="px-6 py-8 flex items-center gap-3 text-sm text-white/40">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading agent activity
          </div>
        ) : activities.length === 0 ? (
          <div className="px-6 py-8 text-sm text-white/35">No agent runs yet.</div>
        ) : activities.slice(0, 8).map((activity, i) => {
          const agentId = activity.agent_name.replace('studio:', '');
          const Icon = iconMap[agentId as keyof typeof iconMap] || Sparkles;
          const isActive = activity.status === 'running' || activity.status === 'processing' || activity.status === 'pending';

          return (
            <motion.div
              key={activity.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="flex items-start gap-3 px-6 py-4 hover:bg-white/2 transition-colors"
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                isActive ? 'bg-neon-cyan/10' : activity.status === 'failed' ? 'bg-red-500/10' : 'bg-neon-lime/10'
              }`}>
                {isActive ? (
                  <Loader2 className="w-4 h-4 text-neon-cyan animate-spin" />
                ) : (
                  <Icon className={`w-4 h-4 ${activity.status === 'failed' ? 'text-red-400' : 'text-neon-lime'}`} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-medium text-white capitalize">{activity.agent_name}</span>
                  <Badge variant={statusVariant[activity.status] || 'gray'} size="sm" dot>
                    {activity.status}
                  </Badge>
                </div>
                <p className="text-xs text-white/50 line-clamp-2">{formatOutput(activity.output, activity.prompt)}</p>
                <p className="text-xs text-white/25 mt-1">{formatRelativeTime(activity.created_at)}</p>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
