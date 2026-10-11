'use client';
import { motion } from 'framer-motion';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { Film, Camera, Layers, Wand2, Zap } from 'lucide-react';
import { Button } from '@/components/ui/Button';

const features = [
  { label: 'Scene Director', desc: 'AI-driven cinematic storytelling and direction', icon: Film },
  { label: 'CineShot', desc: 'Generate images with cinematic camera controls', icon: Camera },
  { label: 'Blend Studio', desc: 'Mix video, image & audio in one cinematic project', icon: Layers },
  { label: 'LensAI', desc: 'Cinematic VFX, depth of field, and camera motion', icon: Wand2 },
];

export default function CinemaPage() {
  return (
    <div className="min-h-screen bg-bg-primary">
      <Navbar />
      <div className="pt-20 pb-16 px-6 max-w-7xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="text-center py-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-neon-purple/10 border border-neon-purple/20 text-neon-purple text-sm font-medium mb-6">
            <Film className="w-4 h-4" />
            Cinema Studio
          </div>
          <h1 className="font-display text-5xl font-bold text-white mb-4">
            Hollywood-Grade <span className="text-neon-purple">AI Cinema</span>
          </h1>
          <p className="text-lg text-white/50 max-w-2xl mx-auto mb-8">
            Direct, shoot and produce cinematic content with AI — no camera crew required.
          </p>
          <Button variant="primary" size="lg" leftIcon={<Zap className="w-5 h-5" />}>Start Directing</Button>
        </motion.div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 max-w-4xl mx-auto">
          {features.map((f, i) => {
            const Icon = f.icon;
            return (
              <motion.div key={f.label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
                className="flex items-start gap-4 p-6 glass border border-white/8 rounded-2xl hover:border-neon-purple/30 transition-all group">
                <div className="w-11 h-11 rounded-xl bg-neon-purple/10 border border-neon-purple/20 flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5 text-neon-purple" />
                </div>
                <div>
                  <h3 className="font-semibold text-white mb-1">{f.label}</h3>
                  <p className="text-sm text-white/40">{f.desc}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
      <Footer />
    </div>
  );
}
