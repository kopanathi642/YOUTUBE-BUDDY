'use client';
import { motion } from 'framer-motion';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { Users, Share2, MessageSquare, GitBranch, Zap } from 'lucide-react';
import { Button } from '@/components/ui/Button';

const features = [
  { label: 'Team Workspaces', desc: 'Create shared AI workspaces for your whole team', icon: Users },
  { label: 'Asset Sharing', desc: 'Instantly share generated assets with collaborators', icon: Share2 },
  { label: 'Live Comments', desc: 'Comment and review AI outputs in real time', icon: MessageSquare },
  { label: 'Version Control', desc: 'Track every change and revert when needed', icon: GitBranch },
];

export default function CollabPage() {
  return (
    <div className="min-h-screen bg-bg-primary">
      <Navbar />
      <div className="pt-20 pb-16 px-6 max-w-7xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="text-center py-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-neon-cyan/10 border border-neon-cyan/20 text-neon-cyan text-sm font-medium mb-6">
            <Users className="w-4 h-4" />
            Team Collaboration
          </div>
          <h1 className="font-display text-5xl font-bold text-white mb-4">
            Create Together with <span className="text-neon-cyan">AI</span>
          </h1>
          <p className="text-lg text-white/50 max-w-2xl mx-auto mb-8">
            Invite your team, share workspaces and collaborate on AI-powered creative projects — in real time.
          </p>
          <Button variant="primary" size="lg" leftIcon={<Zap className="w-5 h-5" />}>Get Started Free</Button>
        </motion.div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 max-w-4xl mx-auto">
          {features.map((f, i) => {
            const Icon = f.icon;
            return (
              <motion.div key={f.label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
                className="flex items-start gap-4 p-6 glass border border-white/8 rounded-2xl hover:border-neon-cyan/30 transition-all group">
                <div className="w-11 h-11 rounded-xl bg-neon-cyan/10 border border-neon-cyan/20 flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5 text-neon-cyan" />
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
