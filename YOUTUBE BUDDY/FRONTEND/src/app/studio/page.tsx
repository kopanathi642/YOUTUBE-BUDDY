'use client';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import {
  Video, Scissors, Film, Sparkles, Wand2,
  MonitorPlay, Users, Maximize, Mic, Pencil,
  ArrowRight, Zap, Star, Layers, MousePointerClick, PenTool, TrendingUp
} from 'lucide-react';
import { Button } from '@/components/ui/Button';

const videoFeatures = [
  { label: 'AI Video Generator', desc: 'The all-in-one AI video creator', icon: Video, href: '/studio/create', badge: 'TOP' },
  { label: 'Cinematic Video', desc: 'Cinematic film-grade video generation', icon: Film, href: '/studio/cinematic', badge: 'TOP' },
  { label: 'Viral Shorts Creator', desc: 'Turn long videos into viral shorts instantly', icon: Scissors, href: '/studio/shorts', badge: 'HOT' },
  { label: 'Video Idea Canvas', desc: 'Visual workflow for video ideas', icon: PenTool, href: '/studio/canvas', badge: 'NEW' },
  { label: 'Trending Topics', desc: 'Discover trending topics for your next video', icon: TrendingUp, href: '/studio/trends', badge: 'HOT' },
  { label: 'Style Blender', desc: 'Mix styles and characters in one scene', icon: Layers, href: '/studio/mixed', badge: undefined },
  { label: 'AI Video Editor', desc: 'AI-assisted precision video editing', icon: Scissors, href: '/studio/edit', badge: undefined },
  { label: 'Video Ad Maker', desc: 'Create high-converting video ads', icon: MousePointerClick, href: '/studio/ads', badge: undefined },
  { label: 'Lip Sync AI', desc: 'Perfect lip-syncing for any language', icon: Mic, href: '/studio/lipsync', badge: undefined },
  { label: 'Video Animation', desc: 'Transform subjects with AI animations', icon: Sparkles, href: '/studio/animate', badge: 'NEW' },
  { label: 'Motion Graphics', desc: 'Control every movement with precision', icon: MonitorPlay, href: '/studio/motion', badge: undefined },
  { label: 'AI Human Presenter', desc: 'Create realistic AI-human presenters', icon: Users, href: '/studio/ugc', badge: undefined },
  { label: '4K Video Upscaler', desc: 'Upscale video to 4K with AI detail', icon: Maximize, href: '/studio/upscale', badge: undefined },
  { label: 'Sketch to Video', desc: 'Turn hand-drawn sketches into animation', icon: Pencil, href: '/studio/draw', badge: undefined },
];

const videoModels = [
  { label: 'MotionV3 Pro', desc: 'Industry-leading temporal consistency', icon: Zap, badge: 'NEW' },
  { label: 'CineModel 2', desc: 'Hollywood-level cinematic rendering', icon: Film, badge: 'TOP' },
  { label: 'ViralFlow', desc: 'Optimized for high-engagement social content', icon: Star, badge: undefined },
  { label: 'Sora Connect', desc: 'Advanced prompt-to-video reasoning', icon: Wand2, badge: 'BETA' },
];

export default function StudioPage() {
  return (
    <div className="min-h-screen bg-bg-primary">
      <Navbar />
      <div className="pt-20 pb-16 px-6 max-w-7xl mx-auto">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center py-16"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-neon-lime/10 border border-neon-lime/20 text-neon-lime text-sm font-medium mb-6">
            <Video className="w-4 h-4" />
            AI Video Studio
          </div>
          <h1 className="font-display text-5xl md:text-6xl font-bold text-white mb-4">
            Next-Gen <span className="text-neon-lime">AI Video</span> Production
          </h1>
          <p className="text-lg text-white/50 max-w-2xl mx-auto mb-8">
            Create, edit, and scale your YouTube content with the world&apos;s most advanced AI video generation models.
          </p>
          <div className="flex items-center justify-center gap-4">
            <Button variant="primary" size="lg" leftIcon={<Sparkles className="w-5 h-5" />}>
              Start Building
            </Button>
            <Button variant="secondary" size="lg">
              View Showcase
            </Button>
          </div>
        </motion.div>

        {/* Features Grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="mb-16"
        >
          <h2 className="font-display text-2xl font-bold text-white mb-2">Video Tools</h2>
          <p className="text-white/40 mb-8">Professional-grade AI video editing and generation</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {videoFeatures.map((f, i) => {
              const Icon = f.icon;
              return (
                <motion.div
                  key={f.label}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + i * 0.04 }}
                  whileHover={{ y: -3 }}
                >
                  <Link href={f.href} className="flex flex-col gap-3 p-5 glass border border-white/8 rounded-2xl hover:border-neon-lime/30 hover:bg-neon-lime/5 transition-all group h-full">
                    <div className="flex items-start justify-between">
                      <div className="w-10 h-10 rounded-xl bg-neon-lime/10 border border-neon-lime/20 flex items-center justify-center group-hover:bg-neon-lime/20 transition-colors">
                        <Icon className="w-5 h-5 text-neon-lime" />
                      </div>
                      {f.badge && (
                        <span className={`text-[9px] font-bold px-2 py-1 rounded-md tracking-wider ${f.badge === 'NEW' ? 'bg-blue-500 text-white' : 'bg-neon-lime text-black'}`}>
                          {f.badge}
                        </span>
                      )}
                    </div>
                    <div>
                      <h3 className="font-semibold text-white text-sm group-hover:text-neon-lime transition-colors">{f.label}</h3>
                      <p className="text-xs text-white/40 mt-1 leading-relaxed">{f.desc}</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-white/20 group-hover:text-neon-lime group-hover:translate-x-1 transition-all mt-auto" />
                  </Link>
                </motion.div>
              );
            })}
          </div>
        </motion.div>

        {/* Models Grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
        >
          <h2 className="font-display text-2xl font-bold text-white mb-2">Video Models</h2>
          <p className="text-white/40 mb-8">High-performance temporal and spatial AI models</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {videoModels.map((m, i) => {
              const Icon = m.icon;
              return (
                <motion.div
                  key={m.label}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + i * 0.04 }}
                  whileHover={{ y: -3 }}
                  className="flex items-start gap-4 p-5 glass border border-white/8 rounded-2xl hover:border-neon-purple/30 hover:bg-neon-purple/5 transition-all group cursor-pointer"
                >
                  <div className="w-10 h-10 rounded-xl bg-neon-purple/10 border border-neon-purple/20 flex items-center justify-center shrink-0 group-hover:bg-neon-purple/20 transition-colors">
                    <Icon className="w-5 h-5 text-neon-purple" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-white text-sm group-hover:text-neon-purple transition-colors">{m.label}</span>
                      {m.badge && (
                        <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-sm tracking-wider bg-neon-lime text-black`}>
                          {m.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-white/40 leading-relaxed">{m.desc}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      </div>
      <Footer />
    </div>
  );
}
