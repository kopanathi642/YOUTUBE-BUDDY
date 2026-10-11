'use client';
import { useState } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { DropZone } from '@/components/studio/DropZone';
import { Scissors, Mic, Flame, Settings, Download, Play, ChevronRight, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import type { AspectRatio } from '@/types';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

const ASPECT_RATIOS: { label: string; value: AspectRatio }[] = [
  { label: 'Landscape', value: '16:9' },
  { label: 'Portrait', value: '9:16' },
  { label: 'Square', value: '1:1' },
  { label: 'Instagram', value: '4:5' },
];

export default function ShortsStudioPage() {
  const [videoId, setVideoId] = useState<string | null>(null);
  const [selectedRatio, setSelectedRatio] = useState<AspectRatio>('9:16');
  const [captions, setCaptions] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [lastShortStatus, setLastShortStatus] = useState<string | null>(null);

  const handleGenerateShorts = async () => {
    if (!videoId) return;
    setGenerating(true);
    try {
      const response = await api.shorts.generate(videoId, {
        aspectRatio: selectedRatio,
        captions,
        autoDetect: true,
      });
      setLastShortStatus(response.data.status);
      toast.success(response.data.status === 'completed' ? 'Short generated.' : 'Short render job created.');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unable to generate shorts.';
      toast.error(message);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <ProtectedRoute>
      <div className="flex h-screen bg-bg-primary overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="sticky top-0 z-20 border-b border-white/6 bg-bg-primary/80 backdrop-blur-xl px-8 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-neon-lime/10 rounded-xl flex items-center justify-center">
                  <Scissors className="w-5 h-5 text-neon-lime" />
                </div>
                <div>
                  <h1 className="font-display text-lg font-bold text-white">AI Shorts Studio</h1>
                  <p className="text-xs text-white/40">Generate shorts from real uploads and render jobs</p>
                </div>
              </div>
              {videoId && (
                <Button variant="primary" size="sm" loading={generating} onClick={handleGenerateShorts} leftIcon={<Wand2 className="w-4 h-4" />}>
                  Generate Shorts
                </Button>
              )}
            </div>
          </div>

          <div className="px-8 py-6">
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              <div className="xl:col-span-1 space-y-5">
                <Card variant="default" padding="md">
                  <h3 className="font-display font-semibold text-white mb-4">Upload Video</h3>
                  <DropZone onUploadComplete={setVideoId} />
                </Card>

                <Card variant="default" padding="md">
                  <h3 className="font-display font-semibold text-white mb-4">Output Format</h3>
                  <div className="grid grid-cols-2 gap-2.5">
                    {ASPECT_RATIOS.map((ratio) => (
                      <button
                        key={ratio.value}
                        onClick={() => setSelectedRatio(ratio.value)}
                        className={`p-3 rounded-xl border text-center transition-all duration-200 ${
                          selectedRatio === ratio.value
                            ? 'border-neon-lime bg-neon-lime/10 text-neon-lime'
                            : 'border-white/10 bg-white/3 text-white/50 hover:border-white/25 hover:text-white'
                        }`}
                      >
                        <p className="text-xs font-semibold">{ratio.value}</p>
                        <p className="text-[10px] opacity-70">{ratio.label}</p>
                      </button>
                    ))}
                  </div>
                </Card>

                <Card variant="default" padding="md">
                  <div className="flex items-center gap-2 mb-4">
                    <Settings className="w-4 h-4 text-white/40" />
                    <h3 className="font-display font-semibold text-white">AI Settings</h3>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-white/60">Auto-captions</span>
                    <button
                      onClick={() => setCaptions(!captions)}
                      className={`w-10 rounded-full transition-all duration-200 relative ${captions ? 'bg-neon-lime' : 'bg-white/15'}`}
                      style={{ height: '22px' }}
                    >
                      <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${captions ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                </Card>
              </div>

              <div className="xl:col-span-1 space-y-5">
                <Card variant="default" padding="md">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Mic className="w-4 h-4 text-neon-cyan" />
                      <h3 className="font-display font-semibold text-white">Transcript</h3>
                    </div>
                    {videoId && <Badge variant="lime" size="sm" dot>Uploaded</Badge>}
                  </div>
                  <div className="text-center py-12">
                    <Mic className="w-10 h-10 text-white/15 mx-auto mb-3" />
                    <p className="text-sm text-white/25">
                      {videoId ? 'Run transcription to populate timestamped captions.' : 'Upload a video to begin.'}
                    </p>
                  </div>
                </Card>
              </div>

              <div className="xl:col-span-1 space-y-5">
                <Card variant="default" padding="md">
                  <div className="flex items-center gap-2 mb-4">
                    <Flame className="w-4 h-4 text-orange-400" />
                    <h3 className="font-display font-semibold text-white">Viral Moments</h3>
                  </div>
                  <div className="p-3.5 rounded-xl bg-white/3 border border-white/6">
                    <p className="text-sm text-white/55">
                      {videoId ? 'Analyze a real transcript to detect viral moments.' : 'Viral moments will appear after analysis.'}
                    </p>
                    {videoId && (
                      <button className="mt-3 flex items-center gap-1 text-xs text-neon-lime/70 hover:text-neon-lime transition-colors">
                        Analysis pipeline <ChevronRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </Card>

                <Card variant="default" padding="md">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-display font-semibold text-white">Preview</h3>
                    {lastShortStatus && <Badge variant={lastShortStatus === 'completed' ? 'lime' : lastShortStatus === 'failed' ? 'gray' : 'cyan'} size="sm">{lastShortStatus}</Badge>}
                  </div>
                  <div
                    className="relative bg-bg-card rounded-xl overflow-hidden border border-white/8 flex items-center justify-center mx-auto"
                    style={{ width: selectedRatio === '9:16' ? 140 : selectedRatio === '1:1' ? 200 : 240, height: selectedRatio === '9:16' ? 240 : 200 }}
                  >
                    {videoId ? (
                      <>
                        <div className="absolute inset-0 bg-gradient-to-br from-neon-lime/5 via-transparent to-neon-cyan/5" />
                        <Play className="w-10 h-10 text-white/40" />
                      </>
                    ) : (
                      <p className="text-xs text-white/20 text-center px-4">Preview appears after upload</p>
                    )}
                  </div>

                  {videoId && (
                    <Button variant="outline" size="sm" fullWidth className="mt-4" leftIcon={<Download className="w-4 h-4" />}>
                      Export Short
                    </Button>
                  )}
                </Card>
              </div>
            </div>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
