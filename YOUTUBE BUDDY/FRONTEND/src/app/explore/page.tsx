'use client';
import { motion } from 'framer-motion';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { Compass, TrendingUp, Star, Zap, ImageIcon, Video, Mic, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import dynamic from 'next/dynamic';

const HeroScene = dynamic(() => import('@/components/three/HeroScene').then(m => ({ default: m.HeroScene })), {
  ssr: false,
});

const categories = [
  { label: 'Images', desc: 'Create & edit AI images', icon: ImageIcon, href: '/image', color: 'lime' },
  { label: 'Videos', desc: 'Generate AI-powered videos', icon: Video, href: '/video', color: 'cyan' },
  { label: 'Audio', desc: 'AI voice & sound tools', icon: Mic, href: '/audio', color: 'purple' },
  { label: 'Trending', desc: 'See what\'s going viral', icon: TrendingUp, href: '/explore/trending', color: 'lime' },
  { label: 'Top Models', desc: 'Best performing AI models', icon: Star, href: '/explore/models', color: 'cyan' },
  { label: 'Quick Start', desc: 'Jump right in', icon: Zap, href: '/studio/shorts', color: 'purple' },
];

const colorMap: Record<string, { bg: string; text: string; borderHover: string; glowHover: string }> = {
  lime: { bg: 'bg-neon-lime/10', text: 'text-neon-lime', borderHover: 'hover:border-neon-lime/40', glowHover: 'hover:shadow-glow-lime' },
  cyan: { bg: 'bg-neon-cyan/10', text: 'text-neon-cyan', borderHover: 'hover:border-neon-cyan/40', glowHover: 'hover:shadow-[0_0_30px_rgba(0,255,255,0.2)]' },
  purple: { bg: 'bg-neon-purple/10', text: 'text-neon-purple', borderHover: 'hover:border-neon-purple/40', glowHover: 'hover:shadow-[0_0_30px_rgba(157,78,221,0.2)]' },
};

export default function ExplorePage() {
  return (
    <div className="min-h-screen bg-bg-primary relative overflow-hidden flex flex-col">
      <Navbar />
      
      {/* Animated 3D Background */}
      <div className="absolute inset-0 z-0">
        <HeroScene />
      </div>

      {/* Background gradients */}
      <div className="absolute inset-0 bg-gradient-radial from-neon-lime/10 via-transparent to-transparent z-0 pointer-events-none" />
      
      {/* Grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.03] z-0 pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(rgba(163,230,53,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(163,230,53,0.5) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }}
      />

      <div className="relative z-10 pt-32 pb-24 px-6 max-w-7xl mx-auto flex-1 flex flex-col justify-center">
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="text-center mb-16">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass border border-white/10 text-white/80 text-sm font-medium mb-8 hover:border-neon-lime/30 transition-colors"
          >
            <Compass className="w-4 h-4 text-neon-lime" />
            Explore Everything
          </motion.div>
          <h1 className="font-display text-6xl md:text-7xl font-bold tracking-tight mb-6">
            <span className="text-white">Discover</span> <br/>
            <span className="text-gradient-lime">AI Tools</span>
          </h1>
          <p className="text-xl text-white/50 max-w-2xl mx-auto leading-relaxed">
            Explore the full suite of YouTube Buddy AI tools — from stunning image generation to fully automated video workflows.
          </p>
        </motion.div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {categories.map((cat, i) => {
            const Icon = cat.icon;
            const colors = colorMap[cat.color];
            return (
              <motion.div 
                key={cat.label} 
                initial={{ opacity: 0, y: 30 }} 
                animate={{ opacity: 1, y: 0 }} 
                transition={{ delay: 0.3 + (i * 0.1), duration: 0.5 }}
              >
                <Link href={cat.href}>
                  <motion.div 
                    whileHover={{ y: -5, scale: 1.02 }}
                    className={`flex flex-col p-8 glass-dark border border-white/10 rounded-3xl ${colors.borderHover} ${colors.glowHover} transition-all duration-300 group h-full relative overflow-hidden`}
                  >
                    <div className={`absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
                    
                    <div className={`w-14 h-14 rounded-2xl ${colors.bg} border border-white/5 group-hover:border-white/20 flex items-center justify-center shrink-0 mb-6 relative z-10 transition-colors`}>
                      <Icon className={`w-7 h-7 ${colors.text}`} />
                    </div>
                    
                    <div className="relative z-10">
                      <h3 className={`font-display font-bold text-2xl text-white group-hover:${colors.text} transition-colors mb-2`}>{cat.label}</h3>
                      <p className="text-white/50 leading-relaxed mb-6">{cat.desc}</p>
                    </div>
                    
                    <div className="mt-auto flex justify-end relative z-10">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center bg-white/5 group-hover:${colors.bg} transition-colors`}>
                        <ArrowRight className={`w-5 h-5 text-white/30 group-hover:${colors.text} transition-colors`} />
                      </div>
                    </div>
                  </motion.div>
                </Link>
              </motion.div>
            );
          })}
        </div>
      </div>
      
      <div className="relative z-10 mt-auto">
        <Footer />
      </div>
    </div>
  );
}
