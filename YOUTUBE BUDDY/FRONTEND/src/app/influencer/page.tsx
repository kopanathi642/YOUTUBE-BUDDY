'use client';
import { motion } from 'framer-motion';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { Users, Smile, Sparkles, Star, Zap } from 'lucide-react';
import { Button } from '@/components/ui/Button';

const features = [
  { label: 'AI Persona', desc: 'Build and manage a unique AI influencer persona', icon: Smile },
  { label: 'Character Studio', desc: 'Design one-of-a-kind AI characters', icon: Users },
  { label: 'AvatarForge', desc: 'Create UGC-style content with AI avatars', icon: Sparkles },
  { label: 'StyleCore 2.0', desc: 'Ultra-realistic fashion visual generation', icon: Star },
];

export default function InfluencerPage() {
  return (
    <div className="min-h-screen bg-bg-primary">
      <Navbar />
      <div className="pt-20 pb-16 px-6 max-w-7xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="text-center py-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-neon-lime/10 border border-neon-lime/20 text-neon-lime text-sm font-medium mb-6">
            <Users className="w-4 h-4" />
            AI Creator
          </div>
          <h1 className="font-display text-5xl font-bold text-white mb-4">
            Build Your <span className="text-neon-lime">AI Creator</span>
          </h1>
          <p className="text-lg text-white/50 max-w-2xl mx-auto mb-8">
            Design AI influencers, build unique personas, and generate content with AI avatars — your brand, amplified.
          </p>
          <Button variant="primary" size="lg" leftIcon={<Zap className="w-5 h-5" />}>Create Your AI</Button>
        </motion.div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 max-w-4xl mx-auto">
          {features.map((f, i) => {
            const Icon = f.icon;
            return (
              <motion.div key={f.label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
                className="flex items-start gap-4 p-6 glass border border-white/8 rounded-2xl hover:border-neon-lime/30 transition-all group">
                <div className="w-11 h-11 rounded-xl bg-neon-lime/10 border border-neon-lime/20 flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5 text-neon-lime" />
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
