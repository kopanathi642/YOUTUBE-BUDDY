'use client';
import { ChangeEvent, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Sidebar } from '@/components/layout/Sidebar';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import {
  Play, Pause, Download, RotateCcw, Clock, Sparkles, Loader2, Image as ImageIcon,
  Video, Mic, Wand2, Upload, AlignLeft, Settings2, SlidersHorizontal,
  Copy, Check, ExternalLink, Music, Flame, Film, Code, Share2
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

// Helper to determine what inputs a tool needs
type ToolType = 'video' | 'image' | 'audio';

interface ToolConfig {
  id: string;
  name: string;
  desc: string;
  type: ToolType;
  requiresUpload: boolean;
  requiresPrompt: boolean;
  hasStyles: boolean;
}

// Giant map of all tools to simple names and simple configs
const toolConfigs: Record<string, ToolConfig> = {
  // === VIDEO TOOLS ===
  create: { id: 'create', name: 'AI Video Generator', desc: 'Type an idea, get a video.', type: 'video', requiresPrompt: true, requiresUpload: false, hasStyles: true },
  cinematic: { id: 'cinematic', name: 'Cinematic Video', desc: 'Control the camera and action.', type: 'video', requiresPrompt: true, requiresUpload: false, hasStyles: true },
  canvas: { id: 'canvas', name: 'Video Idea Canvas', desc: 'Visual workflow for video ideas.', type: 'video', requiresPrompt: true, requiresUpload: true, hasStyles: false },
  mixed: { id: 'mixed', name: 'Style Blender', desc: 'Mix images and video together.', type: 'video', requiresPrompt: true, requiresUpload: true, hasStyles: true },
  edit: { id: 'edit', name: 'AI Video Editor', desc: 'Edit clips using AI text commands.', type: 'video', requiresPrompt: true, requiresUpload: true, hasStyles: false },
  ads: { id: 'ads', name: 'Video Ad Maker', desc: 'Paste a link, get a video ad.', type: 'video', requiresPrompt: true, requiresUpload: false, hasStyles: true },
  trends: { id: 'trends', name: 'Trending Topics', desc: 'Generate videos based on trends.', type: 'video', requiresPrompt: true, requiresUpload: false, hasStyles: true },
  lipsync: { id: 'lipsync', name: 'Lip Sync AI', desc: 'Match lip movements to audio.', type: 'video', requiresPrompt: false, requiresUpload: true, hasStyles: false },
  draw: { id: 'draw', name: 'Sketch to Video', desc: 'Turn your sketch into a video.', type: 'video', requiresPrompt: true, requiresUpload: true, hasStyles: true },
  sketch: { id: 'sketch', name: 'Drawing to Video', desc: 'Animate your drawings.', type: 'video', requiresPrompt: true, requiresUpload: true, hasStyles: true },
  ugc: { id: 'ugc', name: 'AI Human Presenter', desc: 'Create AI actors for your videos.', type: 'video', requiresPrompt: true, requiresUpload: false, hasStyles: true },
  upscale: { id: 'upscale', name: '4K Video Upscaler', desc: 'Make videos sharper and larger.', type: 'video', requiresPrompt: false, requiresUpload: true, hasStyles: false },
  animate: { id: 'animate', name: 'Video Animation', desc: 'Transform and animate objects.', type: 'video', requiresPrompt: true, requiresUpload: true, hasStyles: true },
  motion: { id: 'motion', name: 'Motion Graphics', desc: 'Professional motion graphics.', type: 'video', requiresPrompt: true, requiresUpload: false, hasStyles: true },
  recast: { id: 'recast', name: 'Replace Actor', desc: 'Change the actor in the video.', type: 'video', requiresPrompt: true, requiresUpload: true, hasStyles: false },

  // === IMAGE TOOLS ===
  cineshot: { id: 'cineshot', name: 'Cinematic Photos', desc: 'Generate cinematic photos.', type: 'image', requiresPrompt: true, requiresUpload: false, hasStyles: true },
  moodboard: { id: 'moodboard', name: 'AI Moodboard', desc: 'Create a visual idea board.', type: 'image', requiresPrompt: true, requiresUpload: true, hasStyles: true },
  character: { id: 'character', name: 'Character Designer', desc: 'Design a unique character.', type: 'image', requiresPrompt: true, requiresUpload: true, hasStyles: true },
  persona: { id: 'persona', name: 'Influencer Creator', desc: 'Create an AI influencer face.', type: 'image', requiresPrompt: true, requiresUpload: true, hasStyles: true },
  aesthetic: { id: 'aesthetic', name: 'Style Finder', desc: 'Find your visual style.', type: 'image', requiresPrompt: true, requiresUpload: false, hasStyles: true },
  relight: { id: 'relight', name: 'Photo Lighting', desc: 'Change the lighting on a photo.', type: 'image', requiresPrompt: false, requiresUpload: true, hasStyles: false },
  inpaint: { id: 'inpaint', name: 'Object Eraser', desc: 'Erase and replace parts of a photo.', type: 'image', requiresPrompt: true, requiresUpload: true, hasStyles: false },
  faceswap: { id: 'faceswap', name: 'Face Swapper', desc: 'Swap faces seamlessly.', type: 'image', requiresPrompt: false, requiresUpload: true, hasStyles: false },
  charswap: { id: 'charswap', name: 'Replace Character', desc: 'Swap the whole character.', type: 'image', requiresPrompt: true, requiresUpload: true, hasStyles: false },
  fashion: { id: 'fashion', name: 'Fashion Designer', desc: 'Generate fashion and clothing.', type: 'image', requiresPrompt: true, requiresUpload: true, hasStyles: true },

  // === AUDIO TOOLS ===
  voiceover: { id: 'voiceover', name: 'AI Voice Generator', desc: 'Turn text into realistic speech.', type: 'audio', requiresPrompt: true, requiresUpload: false, hasStyles: false },
  changevoice: { id: 'changevoice', name: 'Voice Changer', desc: 'Change the voice in an audio file.', type: 'audio', requiresPrompt: false, requiresUpload: true, hasStyles: false },
  translation: { id: 'translation', name: 'Audio Translator', desc: 'Translate audio to another language.', type: 'audio', requiresPrompt: false, requiresUpload: true, hasStyles: false },
};

type HistoryItem = {
  id: string;
  prompt: string;
  status: 'completed' | 'processing' | 'failed';
  createdAt: string;
};

export function ToolStudio({ toolId, category }: { toolId: string; category: ToolType }) {
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [style, setStyle] = useState('Realistic');
  const [provider, setProvider] = useState<'gemini' | 'openai' | 'huggingface' | 'ollama'>('gemini');
  const [generatedResult, setGeneratedResult] = useState<string | null>(null);
  const [generatedText, setGeneratedText] = useState<string | null>(null);
  const [modelOutput, setModelOutput] = useState<any | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'script' | 'seo' | 'raw'>('script');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [uploadId, setUploadId] = useState<number | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fallback if toolId isn't found
  const config = toolConfigs[toolId] || {
    id: toolId,
    name: `${toolId} Studio`,
    desc: 'Create amazing content.',
    type: category,
    requiresPrompt: true,
    requiresUpload: false,
    hasStyles: true,
  };

  const isVideo = config.type === 'video';
  const isImage = config.type === 'image';

  const themeColor = isVideo ? 'neon-cyan' : isImage ? 'neon-lime' : 'neon-purple';

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingFile(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await api.videos.upload(formData, () => undefined);
      setUploadId(response.data.id);
      setUploadedFileName(file.name);
      toast.success('File uploaded successfully.');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Upload failed.';
      toast.error(message);
      setUploadId(null);
      setUploadedFileName(null);
    } finally {
      setUploadingFile(false);
      if (event.target) event.target.value = '';
    }
  };

  const handleGenerate = async () => {
    const effectivePrompt = prompt.trim() || `High quality cinematic ${config.name} artwork and composition`;

    setGenerating(true);
    setGeneratedResult(null);
    setGeneratedText(null);

    try {
      const response = await api.studio.generate({
        tool_id: config.id,
        prompt: effectivePrompt,
        style,
        aspect_ratio: isVideo || isImage ? '9:16' : undefined,
        duration: isVideo ? 6 : undefined,
        provider,
        upload_id: uploadId || undefined,
      });

      setGeneratedResult(response.data.preview_url || null);
      setGeneratedText(response.data.generated_text || null);
      const parsed = typeof response.data.model_output === 'object' && response.data.model_output !== null
        ? response.data.model_output
        : null;
      setModelOutput(parsed);

      const newEntry = {
        id: String(response.data.id || Date.now()),
        prompt: effectivePrompt.slice(0, 40) + '...',
        status: 'completed' as const,
        createdAt: 'Just now',
      };
      setHistory([newEntry, ...history]);
      toast.success('Generated successfully!');
    } catch (error: any) {
      const message = error?.response?.data?.detail || (error instanceof Error ? error.message : 'Generation failed.');
      toast.error(message);
    } finally {
      setGenerating(false);
    }
  };

  const parsedData = useMemo(() => {
    if (modelOutput && typeof modelOutput === 'object') return modelOutput;
    if (!generatedText) return null;
    try {
      const stripped = generatedText.trim().replace(/^```(?:json)?\n?/, '').replace(/```$/, '');
      const obj = JSON.parse(stripped);
      if (typeof obj === 'object') return obj;
    } catch {
      // not JSON
    }
    return null;
  }, [modelOutput, generatedText]);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success('Copied to clipboard!');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const Icon = isVideo ? Video : isImage ? ImageIcon : Mic;

  return (
    <ProtectedRoute>
      <div className="flex h-screen bg-bg-primary overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto scrollbar-thin">
          {/* Top Bar */}
          <div className="sticky top-0 z-20 border-b border-white/6 bg-bg-primary/80 backdrop-blur-xl px-8 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 bg-${themeColor}/10 border border-${themeColor}/20 rounded-xl flex items-center justify-center`}>
                <Icon className={`w-5 h-5 text-${themeColor}`} />
              </div>
              <div>
                <h1 className="font-display text-xl font-bold text-white">{config.name}</h1>
                <p className="text-xs text-white/40">{config.desc}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={isVideo ? 'cyan' : isImage ? 'lime' : 'purple'} size="sm">{config.type.toUpperCase()}</Badge>
            </div>
          </div>

          <div className="px-8 py-6 max-w-[1600px] mx-auto">
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
              
              {/* Left Column — SIMPLE CONTROLS (3 columns wide) */}
              <div className="xl:col-span-3 space-y-5">
                
                {/* Upload Section (If Required) */}
                {config.requiresUpload && (
                  <Card variant="default" padding="md">
                    <div className="flex items-center gap-2 mb-3">
                      <Upload className={`w-4 h-4 text-${themeColor}`} />
                      <h3 className="font-display font-semibold text-white">Upload File</h3>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      onChange={handleFileChange}
                      accept={isVideo ? 'video/*' : isImage ? 'image/*' : 'audio/*'}
                    />
                    <div
                      onClick={() => !uploadingFile && fileInputRef.current?.click()}
                      className="w-full h-32 border-2 border-dashed border-white/10 hover:border-white/20 rounded-xl flex flex-col items-center justify-center cursor-pointer transition-colors bg-white/3"
                    >
                      {uploadingFile ? (
                        <Loader2 className="w-6 h-6 text-white/40 mb-2 animate-spin" />
                      ) : (
                        <Upload className="w-6 h-6 text-white/30 mb-2" />
                      )}
                      <p className="text-xs text-white/50 text-center px-3">
                        {uploadedFileName ? uploadedFileName : uploadingFile ? 'Uploading file...' : 'Click to upload a file'}
                      </p>
                    </div>
                  </Card>
                )}

                {/* Prompt Section */}
                {config.requiresPrompt && (
                  <Card variant="default" padding="md">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <AlignLeft className={`w-4 h-4 text-${themeColor}`} />
                        <h3 className="font-display font-semibold text-white">Your Idea</h3>
                      </div>
                    </div>
                    <textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="Type what you want to see or hear..."
                      className={`w-full h-32 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-${themeColor}/50 resize-none transition-all`}
                    />
                  </Card>
                )}

                {/* Styles / Settings */}
                {config.hasStyles && (
                  <Card variant="default" padding="md">
                    <div className="flex items-center gap-2 mb-3">
                      <Sparkles className={`w-4 h-4 text-${themeColor}`} />
                      <h3 className="font-display font-semibold text-white">Look & Feel</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {['Realistic', 'Cinematic', 'Anime', '3D Render'].map((s) => (
                        <button
                          key={s}
                          onClick={() => setStyle(s)}
                          className={`p-2.5 rounded-lg border text-xs font-medium transition-all ${
                            style === s
                              ? `border-${themeColor}/40 bg-${themeColor}/10 text-${themeColor}`
                              : 'border-white/8 bg-white/3 text-white/60 hover:text-white hover:border-white/20'
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </Card>
                )}

                <Card variant="default" padding="md">
                  <div className="flex items-center gap-2 mb-3">
                    <Wand2 className={`w-4 h-4 text-${themeColor}`} />
                    <h3 className="font-display font-semibold text-white">AI Model</h3>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    {[
                      { id: 'gemini', label: 'Google Gemini (Free Tier)' },
                      { id: 'openai', label: 'OpenAI (Cloud)' },
                      { id: 'huggingface', label: 'Hugging Face (Cloud)' },
                      { id: 'ollama', label: 'Ollama (Local AI)' },
                    ].map((option) => (
                      <button
                        key={option.id}
                        onClick={() => setProvider(option.id as 'gemini' | 'openai' | 'huggingface' | 'ollama')}
                        className={`p-2.5 rounded-lg border text-xs font-medium transition-all ${
                          provider === option.id
                            ? `border-${themeColor}/40 bg-${themeColor}/10 text-${themeColor}`
                            : 'border-white/8 bg-white/3 text-white/60 hover:text-white hover:border-white/20'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </Card>

                {/* Size/Length Settings */}
                <Card variant="default" padding="md">
                  <div className="flex items-center gap-2 mb-3">
                    <SlidersHorizontal className={`w-4 h-4 text-${themeColor}`} />
                    <h3 className="font-display font-semibold text-white">Settings</h3>
                  </div>
                  
                  {isVideo && (
                    <div className="space-y-4">
                      <div>
                        <div className="flex justify-between text-xs mb-2 text-white/60">
                          <span>Video Length</span>
                          <span className="text-white">5 seconds</span>
                        </div>
                        <input type="range" min="3" max="10" defaultValue="5" className={`w-full accent-${themeColor}`} />
                      </div>
                    </div>
                  )}

                  {(isVideo || isImage) && (
                    <div className="mt-4">
                      <p className="text-xs mb-2 text-white/60">Size (Aspect Ratio)</p>
                      <div className="grid grid-cols-3 gap-2">
                        <button className="p-2 border border-white/10 rounded-lg text-xs hover:bg-white/5">16:9<br/><span className="text-[9px] text-white/40">YouTube</span></button>
                        <button className={`p-2 border border-${themeColor}/30 bg-${themeColor}/10 text-${themeColor} rounded-lg text-xs`}>9:16<br/><span className="text-[9px] opacity-70">Shorts</span></button>
                        <button className="p-2 border border-white/10 rounded-lg text-xs hover:bg-white/5">1:1<br/><span className="text-[9px] text-white/40">Square</span></button>
                      </div>
                    </div>
                  )}
                </Card>

                <Button
                  variant="primary"
                  fullWidth
                  size="lg"
                  loading={generating}
                  onClick={handleGenerate}
                  className={isVideo ? '!bg-neon-cyan !text-black hover:!bg-neon-cyan/90' : isImage ? '!bg-neon-lime !text-black hover:!bg-neon-lime/90' : '!bg-neon-purple !text-white hover:!bg-neon-purple/90'}
                  leftIcon={<Wand2 className="w-5 h-5" />}
                >
                  Generate Now
                </Button>
              </div>

              {/* Middle Column — MAIN PREVIEW (6 columns wide) */}
              <div className="xl:col-span-6 space-y-5">
                <Card variant="default" padding="md" className="h-full min-h-[500px] flex flex-col">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-display font-semibold text-white">Preview Canvas</h3>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" className="h-8"><Settings2 className="w-4 h-4 mr-2"/> Options</Button>
                      <Button variant="secondary" size="sm" className="h-8"><Download className="w-4 h-4 mr-2"/> Save</Button>
                    </div>
                  </div>
                  
                  <div className="flex-1 bg-black/40 rounded-xl border border-white/8 flex items-center justify-center relative overflow-hidden">
                    <div className={`absolute inset-0 bg-gradient-to-br from-${themeColor}/5 via-transparent to-transparent opacity-50`} />
                    
                    {generating ? (
                      <div className="flex flex-col items-center gap-4 z-10 text-center px-6">
                        <div className="relative">
                          <Loader2 className={`w-12 h-12 text-${themeColor} animate-spin`} />
                          <div className={`absolute inset-0 blur-xl bg-${themeColor}/20 animate-pulse`} />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white mb-1">Creating your AI {config.type}...</p>
                          <p className="text-xs text-white/40">Synthesizing frames and applying {style} style.</p>
                        </div>
                      </div>
                    ) : isVideo && (parsedData || generatedResult) ? (
                      <div className="absolute inset-0 flex flex-col p-4 overflow-y-auto scrollbar-thin">
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 w-full items-start">
                          {/* 9:16 Vertical Video Simulator */}
                          <div className="md:col-span-5 flex flex-col items-center">
                            <div className="w-full max-w-[260px] aspect-[9/16] bg-black rounded-2xl border-2 border-neon-cyan/40 shadow-2xl shadow-neon-cyan/10 relative overflow-hidden flex flex-col justify-between p-3.5 group">
                              {/* Background Scene Poster / Visual */}
                              {generatedResult ? (
                                <img 
                                  src={generatedResult} 
                                  alt="Generated Scene" 
                                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                                />
                              ) : (
                                <div className="absolute inset-0 bg-gradient-to-b from-indigo-950 via-slate-950 to-black flex items-center justify-center">
                                  <Film className="w-12 h-12 text-white/15" />
                                </div>
                              )}

                              <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/20 to-black/60 pointer-events-none" />

                              {/* Top Bar Badges */}
                              <div className="relative z-10 flex items-center justify-between">
                                <span className="text-[9px] font-black tracking-widest px-2 py-0.5 rounded bg-black/70 backdrop-blur-md text-neon-cyan border border-neon-cyan/30">
                                  9:16 SHORTS
                                </span>
                                <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-black/70 backdrop-blur-md text-white/80 border border-white/10">
                                  {parsedData?.target_duration || '28s'}
                                </span>
                              </div>

                              {/* Play / Pause Toggle Button */}
                              <button
                                type="button"
                                onClick={() => setIsPlaying(!isPlaying)}
                                className="absolute inset-0 m-auto w-12 h-12 rounded-full bg-black/60 backdrop-blur-md border border-white/30 flex items-center justify-center text-white hover:scale-110 transition-all z-10 shadow-lg cursor-pointer"
                              >
                                {isPlaying ? <Pause className="w-5 h-5 text-neon-cyan" /> : <Play className="w-5 h-5 text-neon-cyan ml-0.5" />}
                              </button>

                              {/* Bottom Dynamic Subtitle & Audio Deck */}
                              <div className="relative z-10 space-y-2.5">
                                {/* Dynamic Kinetic Caption Overlay */}
                                <div className="bg-black/85 backdrop-blur-md border border-yellow-400/50 rounded-xl p-2.5 shadow-xl text-center">
                                  <span className="text-[8px] font-black text-yellow-400 uppercase tracking-widest block mb-0.5">Viral Hook (0-3s)</span>
                                  <p className="text-[11px] font-black text-white leading-tight drop-shadow-md">
                                    &ldquo;{parsedData?.hook || 'Stop scrolling! Wait till you see this...'}&rdquo;
                                  </p>
                                </div>

                                {/* Audio Pill */}
                                <div className="flex items-center gap-2 px-2 py-1 rounded-lg bg-white/10 backdrop-blur-md border border-white/10 text-[9px] text-white/90">
                                  <Music className={`w-3 h-3 text-neon-cyan ${isPlaying ? 'animate-pulse' : ''}`} />
                                  <span className="truncate flex-1">{parsedData?.audio_vibe || 'Energetic Lo-Fi Synthwave / 128 BPM'}</span>
                                </div>

                                {/* Timeline Scrubber */}
                                <div className="space-y-1">
                                  <div className="h-1 bg-white/20 rounded-full overflow-hidden">
                                    <div className={`h-full bg-neon-cyan rounded-full transition-all duration-300 ${isPlaying ? 'w-2/3' : 'w-1/4'}`} />
                                  </div>
                                  <div className="flex justify-between text-[8px] text-white/60 font-mono">
                                    <span>{isPlaying ? '00:19' : '00:00'}</span>
                                    <span>{parsedData?.target_duration || '00:28'}</span>
                                  </div>
                                </div>
                              </div>
                            </div>

                            <Link 
                              href="/studio/shorts"
                              className="mt-3 w-full max-w-[260px] inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-neon-cyan text-black font-bold text-xs hover:bg-neon-cyan/90 transition-all shadow-lg shadow-neon-cyan/20"
                            >
                              Open in Shorts Editor <ExternalLink className="w-3.5 h-3.5" />
                            </Link>
                          </div>

                          {/* Storyboard & Creator Deck */}
                          <div className="md:col-span-7 flex flex-col space-y-3 min-w-0">
                            {/* Deck Tabs */}
                            <div className="flex items-center justify-between border-b border-white/10 pb-2">
                              <div className="flex gap-1.5">
                                {[
                                  { id: 'script', label: '🎬 Script & Hook' },
                                  { id: 'seo', label: '🏷️ Tags & SEO' },
                                  { id: 'raw', label: '⚙️ Raw JSON' },
                                ].map((tab) => (
                                  <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => setActiveTab(tab.id as any)}
                                    className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-all ${
                                      activeTab === tab.id
                                        ? 'bg-white/15 text-white border border-white/20'
                                        : 'text-white/40 hover:text-white/80'
                                    }`}
                                  >
                                    {tab.label}
                                  </button>
                                ))}
                              </div>

                              {parsedData?.viral_score && (
                                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold">
                                  <Flame className="w-3 h-3" />
                                  {parsedData.viral_score}/100 Viral Score
                                </div>
                              )}
                            </div>

                            {activeTab === 'script' && (
                              <div className="space-y-3">
                                {/* Title Card */}
                                <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-start justify-between gap-2">
                                  <div>
                                    <span className="text-[9px] font-bold uppercase tracking-wider text-neon-cyan">Short Title</span>
                                    <h4 className="text-xs font-bold text-white mt-0.5">{parsedData?.title || 'Viral Short'}</h4>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => copyToClipboard(parsedData?.title || '', 'title')}
                                    className="p-1 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors cursor-pointer"
                                    title="Copy Title"
                                  >
                                    {copiedKey === 'title' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                                  </button>
                                </div>

                                {/* Hook Card */}
                                <div className="p-3 rounded-xl bg-gradient-to-r from-neon-cyan/10 to-transparent border border-neon-cyan/30 flex items-start justify-between gap-2">
                                  <div>
                                    <span className="text-[9px] font-bold uppercase tracking-wider text-neon-cyan flex items-center gap-1">
                                      <Flame className="w-3 h-3" /> First 3-Second Hook
                                    </span>
                                    <p className="text-xs text-white/90 mt-1 font-medium leading-relaxed">
                                      &ldquo;{parsedData?.hook}&rdquo;
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => copyToClipboard(parsedData?.hook || '', 'hook')}
                                    className="p-1 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors cursor-pointer"
                                    title="Copy Hook"
                                  >
                                    {copiedKey === 'hook' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                                  </button>
                                </div>

                                {/* Pacing & Retention Beats */}
                                <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                                  <span className="text-[9px] font-bold uppercase tracking-wider text-white/50">Scene Flow & Retention Beats</span>
                                  <div className="text-xs text-white/80 mt-1.5 whitespace-pre-line leading-relaxed font-sans">
                                    {parsedData?.body}
                                  </div>
                                </div>

                                {/* Call To Action */}
                                {parsedData?.call_to_action && (
                                  <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between gap-2">
                                    <div>
                                      <span className="text-[9px] font-bold uppercase tracking-wider text-white/40">Call To Action</span>
                                      <p className="text-xs text-white/80 mt-0.5">{parsedData.call_to_action}</p>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => copyToClipboard(parsedData.call_to_action, 'cta')}
                                      className="p-1 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors cursor-pointer"
                                    >
                                      {copiedKey === 'cta' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}

                            {activeTab === 'seo' && (
                              <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-3">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-bold text-white">Recommended Hashtags</span>
                                  <button
                                    type="button"
                                    onClick={() => copyToClipboard((parsedData?.hashtags || []).join(' '), 'all_tags')}
                                    className="text-xs text-neon-cyan hover:underline flex items-center gap-1 font-semibold cursor-pointer"
                                  >
                                    {copiedKey === 'all_tags' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                    Copy All
                                  </button>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {(parsedData?.hashtags || ['#Shorts', '#ViralVideo', '#YouTubeBuddy']).map((tag: string, i: number) => (
                                    <button
                                      key={i}
                                      type="button"
                                      onClick={() => copyToClipboard(tag, `tag_${i}`)}
                                      className="px-2.5 py-1 rounded-lg bg-white/8 hover:bg-white/15 border border-white/10 text-xs text-white/90 transition-all font-mono cursor-pointer"
                                    >
                                      {tag} {copiedKey === `tag_${i}` && '✓'}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}

                            {activeTab === 'raw' && (
                              <pre className="p-3 rounded-xl bg-black/60 border border-white/10 text-[11px] text-white/70 font-mono overflow-auto max-h-[300px]">
                                {generatedText || JSON.stringify(parsedData, null, 2)}
                              </pre>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : isImage && generatedResult ? (
                      <div className="absolute inset-0 flex items-center justify-center p-4">
                        <img 
                          src={generatedResult} 
                          alt="Generated AI" 
                          className="max-h-full max-w-full rounded-lg shadow-2xl border border-white/10 object-contain"
                        />
                      </div>
                    ) : generatedResult ? (
                      <div className="absolute inset-0 flex items-center justify-center p-4">
                        <div className="flex flex-col items-center gap-4">
                          <div className="w-20 h-20 bg-neon-purple/20 rounded-full flex items-center justify-center border border-neon-purple/30">
                            <Mic className="w-10 h-10 text-neon-purple" />
                          </div>
                          <audio src={generatedResult} controls className="w-64 accent-neon-purple" />
                        </div>
                      </div>
                    ) : generatedText ? (
                      <div className="relative z-10 max-h-full overflow-y-auto p-6 text-sm leading-6 text-white/75 whitespace-pre-wrap">
                        {generatedText}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-3 text-white/20 z-10">
                        <Icon className="w-16 h-16" />
                        <p className="text-sm font-medium text-white/40">Your creation will appear here</p>
                      </div>
                    )}
                  </div>
                </Card>
              </div>

              {/* Right Column — HISTORY & QUEUE (3 columns wide) */}
              <div className="xl:col-span-3">
                <Card variant="default" padding="md" className="h-full">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <RotateCcw className="w-4 h-4 text-white/40" />
                      <h3 className="font-display font-semibold text-white">Recent Work</h3>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {history.map((item) => (
                      <div key={item.id} className="flex items-start gap-3 p-3 rounded-xl bg-white/3 border border-white/6 hover:border-white/15 transition-all group cursor-pointer">
                        <div className="w-14 h-10 bg-black/40 rounded-lg border border-white/8 flex items-center justify-center shrink-0">
                          {item.status === 'processing' ? (
                            <Loader2 className={`w-4 h-4 text-${themeColor} animate-spin`} />
                          ) : (
                            <Play className="w-4 h-4 text-white/20 group-hover:text-white transition-colors" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0 pt-0.5">
                          <p className="text-xs text-white/80 line-clamp-1 mb-1.5">{item.prompt}</p>
                          <div className="flex items-center justify-between">
                            <span className={`text-[9px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded-sm ${item.status === 'processing' ? 'bg-white/10 text-white/60' : `bg-${themeColor}/20 text-${themeColor}`}`}>
                              {item.status}
                            </span>
                            <span className="text-[10px] text-white/30 flex items-center gap-1">
                              <Clock className="w-3 h-3" /> {item.createdAt}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>

            </div>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
