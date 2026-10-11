'use client';
import { useEffect, useState } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { motion, Reorder } from 'framer-motion';
import {
  TrendingUp, FileText, Search, Scissors, Upload,
  ChevronRight, Zap, ArrowRight, CheckCircle, Loader2, AlertTriangle, Link as LinkIcon, Edit3
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { api } from '@/lib/api';
import { formatRelativeTime } from '@/lib/utils';
import toast from 'react-hot-toast';
import Link from 'next/link';

type AgentStatus = 'idle' | 'running' | 'processing' | 'pending' | 'completed' | 'failed' | 'paused';

type AgentDefinition = {
  id: string;
  name: string;
  icon: typeof TrendingUp;
  color: 'lime' | 'cyan' | 'purple';
  description: string;
  capabilities: string[];
};

type AgentRow = AgentDefinition & {
  status: AgentStatus;
  lastRun: string | null;
  output: string | null;
};

type BackendAgent = {
  id: string;
  status?: AgentStatus;
  last_run?: string | null;
  latest_output?: string | null;
};

const agentDefinitions: AgentDefinition[] = [
  {
    id: 'trend',
    name: 'Trend Agent',
    icon: TrendingUp,
    color: 'lime',
    description: 'Scores topics by viral potential for your niche using the configured AI provider.',
    capabilities: ['Trend analysis', 'Viral score reasoning', 'Niche filtering', 'Topic clustering'],
  },
  {
    id: 'script',
    name: 'Script Agent',
    icon: FileText,
    color: 'cyan',
    description: 'Generates creator scripts with hooks, structure, and calls to action.',
    capabilities: ['Hook generation', 'Script structure', 'CTA optimization', 'Tone control'],
  },
  {
    id: 'seo',
    name: 'SEO Agent',
    icon: Search,
    color: 'purple',
    description: 'Optimizes titles, descriptions, and tags for discovery.',
    capabilities: ['Title options', 'Tag ideas', 'Description drafts', 'Keyword reasoning'],
  },
  {
    id: 'shorts',
    name: 'Shorts Agent',
    icon: Scissors,
    color: 'lime',
    description: 'Finds short-form opportunities from your uploaded video context.',
    capabilities: ['Viral moment analysis', 'Shorts ideas', 'Caption direction', 'Format suggestions'],
  },
  {
    id: 'upload',
    name: 'Upload Agent',
    icon: Upload,
    color: 'cyan',
    description: 'Plans publishing metadata and schedule guidance for finished content.',
    capabilities: ['Schedule guidance', 'Metadata checklist', 'Cross-platform notes', 'Queue planning'],
  },
];

const statusConfig = {
  idle: { label: 'Idle', variant: 'gray' as const, icon: null },
  pending: { label: 'Pending', variant: 'yellow' as const, icon: Loader2 },
  processing: { label: 'Running', variant: 'cyan' as const, icon: Loader2 },
  running: { label: 'Running', variant: 'cyan' as const, icon: Loader2 },
  completed: { label: 'Completed', variant: 'lime' as const, icon: CheckCircle },
  failed: { label: 'Failed', variant: 'red' as const, icon: AlertTriangle },
  paused: { label: 'Paused', variant: 'yellow' as const, icon: null },
};

const colorMap: Record<AgentDefinition['color'], { bg: string; icon: string; border: string }> = {
  lime: { bg: 'bg-neon-lime/10', icon: 'text-neon-lime', border: 'hover:border-neon-lime/30' },
  cyan: { bg: 'bg-neon-cyan/10', icon: 'text-neon-cyan', border: 'hover:border-neon-cyan/30' },
  purple: { bg: 'bg-neon-purple/10', icon: 'text-neon-purple', border: 'hover:border-neon-purple/30' },
};

const buildRows = (backendAgents: BackendAgent[] = []): AgentRow[] => {
  const backendMap = new Map(backendAgents.map((agent) => [agent.id, agent]));
  return agentDefinitions.map((definition) => {
    const backend = backendMap.get(definition.id);
    return {
      ...definition,
      status: backend?.status || 'idle',
      lastRun: backend?.last_run || null,
      output: backend?.latest_output || null,
    };
  });
};

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentRow[]>(() => buildRows());
  const [runningAgents, setRunningAgents] = useState<Set<string>>(new Set());
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadAgents = async () => {
    try {
      const response = await api.agents.list();
      setAgents(buildRows(response.data.data || []));
    } catch {
      toast.error('Unable to load agent status.');
      setAgents(buildRows());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAgents();
  }, []);

  const runAgent = async (agentId: string) => {
    const agent = agents.find((item) => item.id === agentId);
    setRunningAgents((current) => new Set(current).add(agentId));
    try {
      await api.agents.trigger(agentId, {
        prompt: `Run ${agent?.name || agentId} for my current creator workflow using live connected data where available.`,
      });
      toast.success(`${agent?.name || agentId} completed.`);
      await loadAgents();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : `Unable to run ${agent?.name || agentId}.`;
      toast.error(message);
    } finally {
      setRunningAgents((current) => {
        const next = new Set(current);
        next.delete(agentId);
        return next;
      });
    }
  };

  const runPipeline = async () => {
    for (const agent of agents) {
      await runAgent(agent.id);
    }
  };

  return (
    <ProtectedRoute>
      <div className="flex h-screen bg-bg-primary overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="sticky top-0 z-20 border-b border-white/6 bg-bg-primary/80 backdrop-blur-xl px-8 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="font-display text-xl font-bold text-white">AI Agent Automation</h1>
                <p className="text-sm text-white/40">Agent status and outputs come from your backend run history</p>
              </div>
              <Button variant="primary" size="sm" leftIcon={<Zap className="w-4 h-4" />} onClick={runPipeline} disabled={loading || runningAgents.size > 0}>
                Run Pipeline
              </Button>
            </div>
          </div>

          <div className="px-8 py-6 space-y-6">
            <div className="glass border border-white/8 rounded-2xl p-6 overflow-x-auto">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-display font-semibold text-white">Automation Pipeline</h3>
                <span className="text-xs text-white/40 bg-white/5 px-2 py-1 rounded-md">{loading ? 'Syncing' : 'Live Sync'}</span>
              </div>
              
              <Reorder.Group axis="x" values={agents} onReorder={setAgents} className="flex items-center gap-2 min-w-max">
                {agents.map((agent, i) => {
                  const Icon = agent.icon;
                  const colors = colorMap[agent.color];
                  const isRunning = runningAgents.has(agent.id) || agent.status === 'running' || agent.status === 'processing' || agent.status === 'pending';
                  return (
                    <Reorder.Item key={agent.id} value={agent} className="flex items-center gap-2 cursor-grab active:cursor-grabbing">
                      <motion.div
                        onClick={() => setSelectedAgent(selectedAgent === agent.id ? null : agent.id)}
                        className={`flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all w-28 ${
                          selectedAgent === agent.id
                            ? `${colors.bg} border-current ${colors.icon}`
                            : 'bg-white/3 border-white/8 text-white/50 hover:border-white/20'
                        }`}
                      >
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colors.bg}`}>
                          {isRunning ? <Loader2 className={`w-5 h-5 ${colors.icon} animate-spin`} /> : <Icon className={`w-5 h-5 ${colors.icon}`} />}
                        </div>
                        <span className="text-[10px] font-semibold text-center leading-tight">{agent.name.replace(' Agent', '')}</span>
                        <div className={`w-2 h-2 rounded-full ${
                          isRunning ? 'bg-neon-cyan animate-pulse' : agent.status === 'completed' ? 'bg-neon-lime' : agent.status === 'failed' ? 'bg-red-400' : 'bg-white/20'
                        }`} />
                      </motion.div>
                      {i < agents.length - 1 && (
                        <div className="flex items-center gap-1 text-white/15 pointer-events-none">
                          <div className="w-8 h-px bg-white/15" />
                          <ArrowRight className="w-3 h-3 shrink-0" />
                        </div>
                      )}
                    </Reorder.Item>
                  );
                })}
              </Reorder.Group>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {agents.map((agent, i) => {
                const Icon = agent.icon;
                const colors = colorMap[agent.color];
                const isRunning = runningAgents.has(agent.id);
                const statusCfg = statusConfig[isRunning ? 'running' : agent.status] || statusConfig.idle;

                return (
                  <motion.div
                    key={agent.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.07 }}
                    className={`glass border border-white/8 rounded-2xl p-6 flex flex-col transition-all duration-300 ${colors.border}`}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${colors.bg}`}>
                        {isRunning ? <Loader2 className={`w-5.5 h-5.5 ${colors.icon} animate-spin`} size={22} /> : <Icon className={`w-5.5 h-5.5 ${colors.icon}`} size={22} />}
                      </div>
                      <Badge variant={statusCfg.variant} size="sm" dot>{statusCfg.label}</Badge>
                    </div>

                    <h3 className="font-display text-lg font-semibold text-white mb-2">{agent.name}</h3>
                    <p className="text-sm text-white/50 leading-relaxed mb-4 flex-1">{agent.description}</p>

                    <div className="space-y-1.5 mb-5">
                      {agent.capabilities.map((cap) => (
                        <div key={cap} className="flex items-center gap-2 text-xs text-white/50">
                          <ChevronRight className={`w-3 h-3 ${colors.icon}`} />
                          {cap}
                        </div>
                      ))}
                    </div>

                    <div className="text-xs text-white/30 mb-4 flex items-center justify-between gap-4">
                      <span>Last run: {agent.lastRun ? formatRelativeTime(agent.lastRun) : 'Never'}</span>
                      <span className="text-white/50 font-medium truncate">{agent.output || 'No output yet'}</span>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="primary"
                        size="sm"
                        className="flex-1"
                        onClick={() => runAgent(agent.id)}
                        disabled={isRunning}
                        leftIcon={isRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LinkIcon className="w-3.5 h-3.5" />}
                      >
                        Run
                      </Button>
                      <Link href={`/agents/${agent.id}/edit`} className="flex-1">
                        <Button variant="ghost" size="sm" className="w-full" leftIcon={<Edit3 className="w-3.5 h-3.5" />}>
                          Edit
                        </Button>
                      </Link>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
