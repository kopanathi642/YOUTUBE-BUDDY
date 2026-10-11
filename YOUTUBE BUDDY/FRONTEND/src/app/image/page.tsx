'use client';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import {
  ImageIcon, Camera, Layers, Maximize, RefreshCw, Replace,
  Pencil, Shirt, SunMedium, Eraser, Users, Eye, Smile, Wand2,
  Sparkles, Star, Zap, Film, ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';

const features = [
  { label: 'AI Image Generator', desc: 'Generate stunning AI images from text', icon: ImageIcon, href: '/image/create', badge: undefined },
  { label: 'Cinematic Photos', desc: 'Image generation with camera controls', icon: Camera, href: '/image/cineshot', badge: 'TOP' },
  { label: 'AI Moodboard', desc: 'Turn your references into a focused moodboard', icon: Layers, href: '/image/moodboard', badge: undefined },
  { label: 'Character Designer', desc: 'Design and create unique AI characters', icon: Smile, href: '/image/character', badge: undefined },
  { label: 'Influencer Creator', desc: 'Build and manage your AI influencer persona', icon: Users, href: '/image/persona', badge: undefined },
  { label: 'Style Finder', desc: 'Generate your personal visual aesthetic', icon: Eye, href: '/image/aesthetic', badge: 'NEW' },
  { label: 'Photo Lighting', desc: 'Adjust lighting, color and brightness with AI', icon: SunMedium, href: '/image/relight', badge: undefined },
  { label: 'Object Eraser', desc: 'Select an area and describe the change', icon: Eraser, href: '/image/inpaint', badge: undefined },
  { label: 'Photo Upscaler', desc: 'Enhance and upscale image quality with AI', icon: Maximize, href: '/image/upscale', badge: undefined },
  { label: 'Face Swapper', desc: 'Create realistic face swaps effortlessly', icon: RefreshCw, href: '/image/faceswap', badge: undefined },
  { label: 'Replace Character', desc: 'Swap characters while keeping the scene intact', icon: Replace, href: '/image/charswap', badge: undefined },
  { label: 'Sketch to Art', desc: 'Turn rough sketches into polished pictures', icon: Pencil, href: '/image/draw', badge: undefined },
  { label: 'Fashion Designer', desc: 'Design and generate fashion sets with AI', icon: Shirt, href: '/image/fashion', badge: undefined },
];

const models = [
  { label: 'StyleCore 2.0', desc: 'Next-gen ultra-realistic fashion visual model', icon: Star, badge: 'NEW' },
  { label: 'CinemaStyle', desc: 'Cinematic film-grade image aesthetic', icon: Film, badge: 'NEW' },
  { label: 'StoryBoard AI', desc: 'Storyboard, edit and create visual narratives', icon: Layers, badge: undefined },
  { label: 'TextVision 2', desc: '4K images with near-perfect text rendering', icon: Wand2, badge: 'NEW' },
  { label: 'FlashArt 2', desc: 'Pro quality images at lightning speed', icon: Zap, badge: undefined },
  { label: 'FlashArt Pro', desc: 'Best-in-class 4K image generation model', icon: Zap, badge: 'TOP' },
  { label: 'DreamGen Lite', desc: 'Intelligent visual reasoning at low cost', icon: Eye, badge: undefined },
  { label: 'TextVision 1.5', desc: 'True-color precision rendering model', icon: Wand2, badge: undefined },
  { label: 'ImaginX', desc: 'Versatile multi-style image generation', icon: Sparkles, badge: undefined },
  { label: 'SpeedPixel 2', desc: 'Speed-optimized detail and composition', icon: Camera, badge: undefined },
  { label: 'PixelEdit', desc: 'Advanced AI image editing and refinement', icon: Pencil, badge: undefined },
  { label: 'PortraitAI', desc: 'Instant lifelike portrait generation', icon: Smile, badge: undefined },
  { label: 'UltraScale', desc: 'High-resolution image upscaling engine', icon: Maximize, badge: undefined },
];

export default function ImagePage() {
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
            <ImageIcon className="w-4 h-4" />
            AI Image Studio
          </div>
          <h1 className="font-display text-5xl md:text-6xl font-bold text-white mb-4">
            Create Stunning <span className="text-neon-lime">AI Images</span>
          </h1>
          <p className="text-lg text-white/50 max-w-2xl mx-auto mb-8">
            From photorealistic portraits to cinematic scenes — generate, edit, and transform images with the most powerful AI tools on the planet.
          </p>
          <div className="flex items-center justify-center gap-4">
            <Button variant="primary" size="lg" leftIcon={<Sparkles className="w-5 h-5" />}>
              Start Creating
            </Button>
            <Button variant="secondary" size="lg">
              View Gallery
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
          <h2 className="font-display text-2xl font-bold text-white mb-2">Features</h2>
          <p className="text-white/40 mb-8">Everything you need to create world-class images</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {features.map((f, i) => {
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
                        <span className={`text-[9px] font-bold px-2 py-1 rounded-md tracking-wider ${f.badge === 'TOP' ? 'bg-blue-500 text-white' : 'bg-neon-lime text-black'}`}>
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
          <h2 className="font-display text-2xl font-bold text-white mb-2">Models</h2>
          <p className="text-white/40 mb-8">Powered by the most advanced image generation models</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {models.map((m, i) => {
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
                        <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-sm tracking-wider ${m.badge === 'TOP' ? 'bg-blue-500 text-white' : 'bg-neon-lime text-black'}`}>
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
