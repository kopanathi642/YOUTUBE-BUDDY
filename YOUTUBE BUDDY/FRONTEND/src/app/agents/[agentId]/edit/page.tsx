'use client';
import { useState, use, useEffect } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Sidebar } from '@/components/layout/Sidebar';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Reorder } from 'framer-motion';
import { ArrowLeft, Save, Plus, GripVertical, Trash2, Bot, Layers, Zap, Settings } from 'lucide-react';
import Link from 'next/link';
import toast from 'react-hot-toast';

const agentTemplates: Record<string, { name: string; description: string; steps: { id: string; action: string; source: string }[] }> = {
  'trend': {
    name: 'Trend Agent',
    description: 'Monitors YouTube trends in real-time and scores topics by viral potential in your niche.',
    steps: [
      { id: '1', action: 'Scrape YouTube Trending Page', source: 'YouTube API' },
      { id: '2', action: 'Filter by Channel Niche', source: 'Internal Rules' },
      { id: '3', action: 'Calculate Viral Score', source: 'AI Model' },
    ]
  },
  'script': {
    name: 'Script Agent',
    description: 'Generates full video scripts with hooks, structured content, and CTAs based on trending topics.',
    steps: [
      { id: '1', action: 'Generate 3 Hook Options', source: 'OpenAI GPT-4' },
      { id: '2', action: 'Draft Main Body Content', source: 'OpenAI GPT-4' },
      { id: '3', action: 'Insert Sponsor/CTA Segments', source: 'Internal Logic' },
    ]
  },
};

export default function AgentEditorPage({ params }: { params: Promise<{ agentId: string }> }) {
  const resolvedParams = use(params);
  const agentId = resolvedParams.agentId;
  
  const [agentName, setAgentName] = useState('');
  const [agentDesc, setAgentDesc] = useState('');
  const [steps, setSteps] = useState<{ id: string; action: string; source: string }[]>([]);

  useEffect(() => {
    // Load agent data
    const data = agentTemplates[agentId as string] || {
      name: `${agentId.charAt(0).toUpperCase() + agentId.slice(1)} Agent`,
      description: 'Custom AI agent automation flow.',
      steps: [
        { id: '1', action: 'Initial Processing', source: 'Default' }
      ]
    };
    setAgentName(data.name);
    setAgentDesc(data.description);
    setSteps(data.steps);
  }, [agentId]);

  const handleAddStep = () => {
    setSteps([...steps, { id: Math.random().toString(36).substr(2, 9), action: '', source: 'New Integration' }]);
  };

  const handleRemoveStep = (id: string) => {
    setSteps(steps.filter(s => s.id !== id));
  };

  const updateStep = (id: string, field: 'action' | 'source', value: string) => {
    setSteps(steps.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const handleSave = () => {
    toast.error('Agent configuration persistence is not enabled yet.');
  };

  return (
    <ProtectedRoute>
      <div className="flex h-screen bg-bg-primary overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto scrollbar-thin">
          {/* Header */}
          <div className="sticky top-0 z-20 border-b border-white/6 bg-bg-primary/80 backdrop-blur-xl px-8 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Link href="/agents">
                  <Button variant="ghost" size="sm" className="p-2 border border-white/10">
                    <ArrowLeft className="w-4 h-4 text-white/70" />
                  </Button>
                </Link>
                <div>
                  <h1 className="font-display text-xl font-bold text-white flex items-center gap-2">
                    <Bot className="w-5 h-5 text-neon-cyan" />
                    Edit Agent: {agentName}
                  </h1>
                  <p className="text-sm text-white/40">Configure exactly what this agent does step-by-step</p>
                </div>
              </div>
              <Button variant="primary" size="sm" leftIcon={<Save className="w-4 h-4" />} onClick={handleSave}>
                Save Agent
              </Button>
            </div>
          </div>

          <div className="px-8 py-6 max-w-4xl mx-auto space-y-8">
            {/* General Settings */}
            <div className="glass border border-white/8 rounded-2xl p-6 space-y-4">
              <h2 className="font-display font-semibold text-white flex items-center gap-2">
                <Settings className="w-4 h-4 text-white/50" />
                General Settings
              </h2>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-xs font-medium text-white/50 mb-1.5">Agent Name</label>
                  <Input 
                    value={agentName}
                    onChange={(e) => setAgentName(e.target.value)}
                    className="bg-bg-secondary/50 border-white/10"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-white/50 mb-1.5">Description</label>
                  <Input 
                    value={agentDesc}
                    onChange={(e) => setAgentDesc(e.target.value)}
                    className="bg-bg-secondary/50 border-white/10"
                  />
                </div>
              </div>
            </div>

            {/* Workflow Steps Builder */}
            <div className="glass border border-white/8 rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/6 bg-white/2">
                <div>
                  <h2 className="font-display font-semibold text-white flex items-center gap-2">
                    <Layers className="w-4 h-4 text-white/50" />
                    Automation Workflow Steps
                  </h2>
                  <p className="text-xs text-white/40 mt-1">Drag to reorder. These steps execute sequentially.</p>
                </div>
                <Button variant="secondary" size="sm" onClick={handleAddStep} leftIcon={<Plus className="w-4 h-4" />}>
                  Add Step
                </Button>
              </div>

              <div className="p-6">
                <Reorder.Group axis="y" values={steps} onReorder={setSteps} className="space-y-3">
                  {steps.map((step, index) => (
                    <Reorder.Item key={step.id} value={step} className="relative z-10 cursor-grab active:cursor-grabbing">
                      <div className="flex items-center gap-4 p-4 rounded-xl border border-white/10 bg-bg-secondary/80 hover:border-white/20 transition-colors group">
                        <GripVertical className="w-5 h-5 text-white/20 group-hover:text-white/40 cursor-grab" />
                        
                        <div className="w-8 h-8 rounded-lg bg-neon-cyan/10 border border-neon-cyan/20 flex items-center justify-center shrink-0">
                          <span className="font-mono font-bold text-neon-cyan text-sm">{index + 1}</span>
                        </div>
                        
                        <div className="flex-1 grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-[10px] font-medium text-white/30 mb-1 uppercase tracking-wider">Action / Task</label>
                            <Input 
                              value={step.action}
                              onChange={(e) => updateStep(step.id, 'action', e.target.value)}
                              placeholder="e.g., Scrape keywords"
                              className="h-9 text-sm bg-black/20 border-white/5"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-medium text-white/30 mb-1 uppercase tracking-wider">Source / Integration</label>
                            <Input 
                              value={step.source}
                              onChange={(e) => updateStep(step.id, 'source', e.target.value)}
                              placeholder="e.g., YouTube API"
                              className="h-9 text-sm bg-black/20 border-white/5"
                            />
                          </div>
                        </div>

                        <button 
                          onClick={() => handleRemoveStep(step.id)}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-white/20 hover:text-red-400 hover:bg-red-400/10 transition-colors shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </Reorder.Item>
                  ))}
                  {steps.length === 0 && (
                    <div className="text-center py-12 border border-dashed border-white/10 rounded-xl">
                      <Zap className="w-8 h-8 text-white/20 mx-auto mb-3" />
                      <p className="text-white/40 text-sm">No steps defined. Add a step to begin automation.</p>
                    </div>
                  )}
                </Reorder.Group>
              </div>
            </div>

          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
