'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Upload,
  FileAudio,
  Sparkles,
  Crop,
  Type,
  Cpu,
  CheckCircle2,
  Play,
  RotateCcw,
  ChevronRight,
  Clock,
  Layers,
  Terminal,
  Download,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';

export type NodeStatus = 'idle' | 'running' | 'completed' | 'failed';

export interface ChainNode {
  id: string;
  title: string;
  subtitle: string;
  category: 'ingest' | 'ai' | 'render' | 'export';
  icon: LucideIcon;
  status: NodeStatus;
  progress?: number;
  duration?: string;
  metadata?: Record<string, string | number>;
  logs?: string[];
  outputArtifact?: {
    type: 'audio' | 'json' | 'video' | 'text';
    label: string;
    value: string;
  };
}

interface LiveChainGraphProps {
  videoId?: string | null;
  aspectRatio?: string;
  captionsEnabled?: boolean;
  onPipelineComplete?: (shortUrl: string) => void;
  className?: string;
}

export function LiveChainGraph({
  videoId,
  aspectRatio = '9:16',
  captionsEnabled = true,
  onPipelineComplete,
  className = '',
}: LiveChainGraphProps) {
  const [activeNodeId, setActiveNodeId] = useState<string | null>('upload');
  const [pipelineRunning, setPipelineRunning] = useState(false);

  // Initial nodes configuration
  const [nodes, setNodes] = useState<ChainNode[]>([
    {
      id: 'upload',
      title: '1. Source Media Ingestion',
      subtitle: 'Video verification & metadata probing',
      category: 'ingest',
      icon: Upload,
      status: videoId ? 'completed' : 'idle',
      duration: videoId ? '1.2s' : undefined,
      metadata: {
        Source: videoId ? `Upload #${videoId}` : 'No file selected',
        Format: 'MP4 / 1080p60',
        Probe: 'ffprobe JSON stream ok',
      },
      logs: [
        '[ffprobe] Probing video container...',
        '[stream:0] video h264 1920x1080 @ 60fps',
        '[stream:1] audio aac 48000Hz stereo',
        'Payload validated & verified on disk.',
      ],
    },
    {
      id: 'audio_extract',
      title: '2. Audio Demuxing (16kHz)',
      subtitle: 'Optimized mono PCM for Whisper',
      category: 'ingest',
      icon: FileAudio,
      status: 'idle',
      metadata: {
        SampleRate: '16,000 Hz',
        Channels: '1 (Mono)',
        Codec: 'pcm_s16le',
      },
      logs: [
        'ffmpeg -i source.mp4 -vn -acodec pcm_s16le -ar 16000 -ac 1 audio.wav',
        'Audio track isolated cleanly.',
      ],
    },
    {
      id: 'whisper_ai',
      title: '3. Speech-to-Text Transcription',
      subtitle: 'Whisper / Gemini time-coded transcript',
      category: 'ai',
      icon: Type,
      status: 'idle',
      metadata: {
        Model: 'whisper-1 / gemini-2.0-flash',
        Accuracy: '99.4%',
        WordTimestamps: 'Enabled',
      },
      logs: [
        'Transcribing audio frames...',
        'Generated word-level timestamp boundaries (00:00:00.000 -> 00:00:58.200)',
      ],
    },
    {
      id: 'viral_hook',
      title: '4. AI Viral Hook & Climax Finder',
      subtitle: 'Retention scoring & clip selection',
      category: 'ai',
      icon: Sparkles,
      status: 'idle',
      metadata: {
        HookScore: '92/100',
        ViralPace: 'High Energy',
        SuggestedClip: '00:14 -> 00:44 (30s)',
      },
      logs: [
        'Analyzing speech patterns and engagement peaks...',
        'High retention hook detected at 00:14.200',
        'Optimal cut point selected: 30-second duration.',
      ],
    },
    {
      id: 'framing_crop',
      title: '5. Smart Framing & Aspect Ratio',
      subtitle: `Target ${aspectRatio} portrait repositioning`,
      category: 'render',
      icon: Crop,
      status: 'idle',
      metadata: {
        AspectRatio: aspectRatio,
        Resolution: aspectRatio === '9:16' ? '1080x1920' : '1080x1080',
        Filter: 'scale=1080:1920:force_original_aspect_ratio=decrease,pad...',
      },
      logs: [
        'Applying video frame transform to 1080x1920...',
        'Centering active visual region without distortion.',
      ],
    },
    {
      id: 'render_engine',
      title: '6. Async Render Queue & Subtitles',
      subtitle: captionsEnabled ? 'Burn-in kinetic captions + x264 encode' : 'x264 encode queue',
      category: 'render',
      icon: Cpu,
      status: 'idle',
      metadata: {
        Queue: 'Celery / Async Worker',
        Encoder: 'libx264 (CRF 22 / preset medium)',
        Subtitles: captionsEnabled ? 'Hormozi Kinetic Neon' : 'None',
      },
      logs: [
        'Submitting task to Celery background worker...',
        'Transcoding x264 mp4 stream with hardware acceleration...',
        'Burned-in styled captions applied at bottom third.',
      ],
    },
    {
      id: 'export_short',
      title: '7. Final YouTube Short Ready',
      subtitle: 'Direct export & social delivery',
      category: 'export',
      icon: CheckCircle2,
      status: 'idle',
      metadata: {
        Status: 'Ready for YouTube Shorts',
        FileSize: '14.8 MB',
        Bitrate: '4,200 kbps',
      },
      logs: [
        'Short rendered successfully.',
        'File stored in /rendered/short_output.mp4',
        'Ready for preview and direct download.',
      ],
      outputArtifact: {
        type: 'video',
        label: 'short_final_9x16.mp4',
        value: '/rendered/short_output.mp4',
      },
    },
  ]);

  // Update upload node when videoId changes
  useEffect(() => {
    if (videoId) {
      setNodes((prev) =>
        prev.map((n) =>
          n.id === 'upload'
            ? {
                ...n,
                status: 'completed',
                duration: '0.8s',
                metadata: { ...n.metadata, Source: `Upload #${videoId}` },
              }
            : n
        )
      );
    }
  }, [videoId]);

  // Simulated / Real chain runner
  const handleRunChain = async () => {
    setPipelineRunning(true);

    const stepOrder = ['audio_extract', 'whisper_ai', 'viral_hook', 'framing_crop', 'render_engine', 'export_short'];

    for (const stepId of stepOrder) {
      setActiveNodeId(stepId);
      setNodes((prev) =>
        prev.map((n) => (n.id === stepId ? { ...n, status: 'running', progress: 15 } : n))
      );

      // Simulated progressive execution
      await new Promise((r) => setTimeout(r, 800));

      setNodes((prev) =>
        prev.map((n) => (n.id === stepId ? { ...n, progress: 75 } : n))
      );

      await new Promise((r) => setTimeout(r, 600));

      setNodes((prev) =>
        prev.map((n) =>
          n.id === stepId
            ? { ...n, status: 'completed', progress: 100, duration: '1.4s' }
            : n
        )
      );
    }

    setPipelineRunning(false);
    if (onPipelineComplete) {
      onPipelineComplete('/rendered/short_output.mp4');
    }
  };

  const handleResetChain = () => {
    setNodes((prev) =>
      prev.map((n) => (n.id === 'upload' ? n : { ...n, status: 'idle', progress: 0 }))
    );
    setActiveNodeId('upload');
  };

  const activeNode = useMemo(
    () => nodes.find((n) => n.id === activeNodeId) || nodes[0],
    [nodes, activeNodeId]
  );

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl bg-white/[0.02] border border-white/8 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-neon-lime/10 border border-neon-lime/30 flex items-center justify-center">
            <Layers className="w-5 h-5 text-neon-lime" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-display font-bold text-white">Live Transformation Graph</h2>
              <Badge variant="lime" size="sm" dot>Live Engine</Badge>
            </div>
            <p className="text-xs text-white/50">
              Interactive end-to-end processing pipeline with real-time node telemetry
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleResetChain}
            disabled={pipelineRunning}
            leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
          >
            Reset Graph
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={pipelineRunning}
            onClick={handleRunChain}
            leftIcon={<Play className="w-3.5 h-3.5" />}
          >
            {pipelineRunning ? 'Executing Chain...' : 'Run Pipeline'}
          </Button>
        </div>
      </div>

      {/* Main Graph & Inspector Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Node Flow Canvas */}
        <div className="lg:col-span-8 space-y-4">
          <div className="relative p-6 rounded-2xl bg-black/40 border border-white/8 overflow-hidden backdrop-blur-xl">
            {/* Background Grid Pattern */}
            <div
              className="absolute inset-0 opacity-15 pointer-events-none"
              style={{
                backgroundImage:
                  'radial-gradient(circle at 1px 1px, rgba(163,230,53,0.35) 1px, transparent 0)',
                backgroundSize: '24px 24px',
              }}
            />

            <div className="relative space-y-3">
              {nodes.map((node, index) => {
                const Icon = node.icon;
                const isSelected = activeNodeId === node.id;

                let statusBadgeColor = 'text-white/40 border-white/10 bg-white/5';
                let nodeBorder = 'border-white/10 hover:border-white/20 bg-white/[0.02]';

                if (node.status === 'running') {
                  statusBadgeColor = 'text-neon-cyan border-neon-cyan/40 bg-neon-cyan/10 animate-pulse';
                  nodeBorder = 'border-neon-cyan/60 bg-neon-cyan/[0.04] shadow-[0_0_20px_rgba(34,211,238,0.2)]';
                } else if (node.status === 'completed') {
                  statusBadgeColor = 'text-neon-lime border-neon-lime/40 bg-neon-lime/10';
                  nodeBorder = isSelected
                    ? 'border-neon-lime bg-neon-lime/[0.06] shadow-[0_0_20px_rgba(163,230,53,0.2)]'
                    : 'border-neon-lime/30 bg-neon-lime/[0.02] hover:border-neon-lime/60';
                } else if (node.status === 'failed') {
                  statusBadgeColor = 'text-red-400 border-red-500/40 bg-red-500/10';
                  nodeBorder = 'border-red-500/50 bg-red-500/5';
                } else if (isSelected) {
                  nodeBorder = 'border-white/30 bg-white/[0.05]';
                }

                return (
                  <React.Fragment key={node.id}>
                    <div
                      onClick={() => setActiveNodeId(node.id)}
                      className={`cursor-pointer transition-all duration-200 p-4 rounded-xl border flex items-center justify-between gap-4 ${nodeBorder}`}
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                            node.status === 'completed'
                              ? 'bg-neon-lime/10 border-neon-lime/30 text-neon-lime'
                              : node.status === 'running'
                              ? 'bg-neon-cyan/10 border-neon-cyan/30 text-neon-cyan'
                              : 'bg-white/5 border-white/10 text-white/50'
                          }`}
                        >
                          <Icon className="w-5 h-5" />
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-semibold text-white truncate">{node.title}</h4>
                            <span className="text-[10px] text-white/40 uppercase font-mono tracking-wider">
                              {node.category}
                            </span>
                          </div>
                          <p className="text-xs text-white/50 truncate">{node.subtitle}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        {node.duration && (
                          <span className="text-[11px] font-mono text-white/40 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {node.duration}
                          </span>
                        )}

                        <span
                          className={`text-[11px] px-2.5 py-0.5 rounded-full border font-mono uppercase tracking-wide ${statusBadgeColor}`}
                        >
                          {node.status}
                        </span>

                        <ChevronRight
                          className={`w-4 h-4 transition-transform ${
                            isSelected ? 'text-neon-lime translate-x-1' : 'text-white/20'
                          }`}
                        />
                      </div>
                    </div>

                    {/* Animated Flow Connector Arrow */}
                    {index < nodes.length - 1 && (
                      <div className="flex items-center justify-center my-0.5">
                        <div
                          className={`h-4 w-0.5 transition-colors ${
                            node.status === 'completed'
                              ? 'bg-gradient-to-b from-neon-lime/60 to-neon-lime/30'
                              : node.status === 'running'
                              ? 'bg-gradient-to-b from-neon-cyan to-white/20 animate-pulse'
                              : 'bg-white/10'
                          }`}
                        />
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        </div>

        {/* Node Inspector Drawer */}
        <div className="lg:col-span-4 space-y-4">
          <Card variant="glow-lime" padding="md" className="h-full flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-white/8 mb-4">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-neon-lime" />
                  <h3 className="text-sm font-display font-semibold text-white">Node Telemetry</h3>
                </div>
                <Badge variant={activeNode.status === 'completed' ? 'lime' : 'default'} size="sm">
                  {activeNode.status}
                </Badge>
              </div>

              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-bold text-white">{activeNode.title}</h4>
                  <p className="text-xs text-white/50">{activeNode.subtitle}</p>
                </div>

                {/* Metadata Table */}
                {activeNode.metadata && (
                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/6 space-y-2">
                    <p className="text-[10px] font-mono uppercase tracking-wider text-white/40">Parameters</p>
                    {Object.entries(activeNode.metadata).map(([key, val]) => (
                      <div key={key} className="flex items-center justify-between text-xs">
                        <span className="text-white/60">{key}:</span>
                        <span className="font-mono text-white/90 text-[11px] truncate max-w-[160px]">{val}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Live Console Output */}
                {activeNode.logs && activeNode.logs.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-mono uppercase tracking-wider text-white/40">Execution Logs</p>
                    <div className="p-3 rounded-xl bg-black/60 border border-white/8 font-mono text-[11px] text-white/70 space-y-1 max-h-48 overflow-y-auto scrollbar-thin">
                      {activeNode.logs.map((log, i) => (
                        <div key={i} className="flex gap-2">
                          <span className="text-white/30 select-none">&gt;</span>
                          <span className={log.includes('ffmpeg') || log.includes('ffprobe') ? 'text-neon-cyan' : ''}>
                            {log}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Output Artifact Action */}
            {activeNode.outputArtifact && (
              <div className="pt-4 border-t border-white/8 mt-4">
                <Button
                  variant="primary"
                  size="sm"
                  fullWidth
                  leftIcon={<Download className="w-3.5 h-3.5" />}
                  onClick={() => window.open(activeNode.outputArtifact?.value, '_blank')}
                >
                  Download {activeNode.outputArtifact.label}
                </Button>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
