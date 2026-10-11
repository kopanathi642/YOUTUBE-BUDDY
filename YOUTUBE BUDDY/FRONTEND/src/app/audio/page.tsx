'use client';
import { motion } from 'framer-motion';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { Mic, RefreshCw, Replace, Music, Wand2, Sparkles, Star, Zap, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import Link from 'next/link';

const features = [
  { label: 'AI Voice Generator', desc: 'Generate natural speech from any text', icon: Mic, href: '/audio/voiceover', badge: undefined },
  { label: 'Voice Changer', desc: 'Swap voices in any video instantly', icon: RefreshCw, href: '/audio/changevoice', badge: undefined },
  { label: 'Audio Translator', desc: 'Translate speech across any language', icon: Replace, href: '/audio/translation', badge: undefined },
];

const models = [
  { label: 'EmoteVoice 3', desc: 'Expressive AI voice with full emotion control', icon: Star, badge: undefined },
  { label: 'CrystalSpeech HD', desc: 'Studio-quality HD text-to-speech model', icon: Wand2, badge: undefined },
  { label: 'PolySpeak', desc: 'Multilingual AI text-to-speech engine', icon: Music, badge: 'NEW' },
  { label: 'FlowTone', desc: 'Long-form expressive voice synthesis', icon: Sparkles, badge: undefined },
];

export default function AudioPage() {
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
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-neon-cyan/10 border border-neon-cyan/20 text-neon-cyan text-sm font-medium mb-6">
            <Mic className="w-4 h-4" />
            AI Audio Studio
          </div>
          <h1 className="font-display text-5xl md:text-6xl font-bold text-white mb-4">
            Voice & Audio <span className="text-neon-cyan">Powered by AI</span>
          </h1>
          <p className="text-lg text-white/50 max-w-2xl mx-auto mb-8">
            Generate natural voices, swap audio tracks, translate speech in real-time — all with cutting-edge AI audio models.
          </p>
          <div className="flex items-center justify-center gap-4">
            <Button variant="primary" size="lg" leftIcon={<Zap className="w-5 h-5" />}>
              Start Creating
            </Button>
            <Button variant="secondary" size="lg">Explore Models</Button>
          </div>
        </motion.div>

        {/* Features */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="mb-16">
          <h2 className="font-display text-2xl font-bold text-white mb-2">Features</h2>
          <p className="text-white/40 mb-8">Professional audio tools for every creator</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((f, i) => {
              const Icon = f.icon;
              return (
                <motion.div key={f.label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.08 }} whileHover={{ y: -3 }}>
                  <Link href={f.href} className="flex flex-col gap-3 p-6 glass border border-white/8 rounded-2xl hover:border-neon-cyan/30 hover:bg-neon-cyan/5 transition-all group h-full">
                    <div className="flex items-start justify-between">
                      <div className="w-12 h-12 rounded-2xl bg-neon-cyan/10 border border-neon-cyan/20 flex items-center justify-center group-hover:bg-neon-cyan/20 transition-colors">
                        <Icon className="w-6 h-6 text-neon-cyan" />
                      </div>
                      {f.badge && <span className="text-[9px] font-bold px-2 py-1 rounded-md tracking-wider bg-neon-lime text-black">{f.badge}</span>}
                    </div>
                    <h3 className="font-semibold text-white group-hover:text-neon-cyan transition-colors">{f.label}</h3>
                    <p className="text-sm text-white/40 leading-relaxed flex-1">{f.desc}</p>
                    <ArrowRight className="w-4 h-4 text-white/20 group-hover:text-neon-cyan group-hover:translate-x-1 transition-all" />
                  </Link>
                </motion.div>
              );
            })}
          </div>
        </motion.div>

        {/* Models */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
          <h2 className="font-display text-2xl font-bold text-white mb-2">Models</h2>
          <p className="text-white/40 mb-8">Powered by the world&apos;s best AI voice models</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {models.map((m, i) => {
              const Icon = m.icon;
              return (
                <motion.div key={m.label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 + i * 0.07 }} whileHover={{ y: -3 }}
                  className="flex items-start gap-4 p-5 glass border border-white/8 rounded-2xl hover:border-neon-purple/30 hover:bg-neon-purple/5 transition-all group cursor-pointer">
                  <div className="w-10 h-10 rounded-xl bg-neon-purple/10 border border-neon-purple/20 flex items-center justify-center shrink-0 group-hover:bg-neon-purple/20 transition-colors">
                    <Icon className="w-5 h-5 text-neon-purple" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-white text-sm group-hover:text-neon-purple transition-colors">{m.label}</span>
                      {m.badge && <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-sm tracking-wider bg-neon-lime text-black">{m.badge}</span>}
                    </div>
                    <p className="text-xs text-white/40">{m.desc}</p>
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
