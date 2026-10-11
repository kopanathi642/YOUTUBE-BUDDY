'use client';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { motion, useScroll, useTransform } from 'framer-motion';
import { useRef } from 'react';
import {
  Zap,
  ArrowRight,
  Play,
  Sparkles,
  Database,
  Radio,
  Bot,
  Server,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';

const HeroScene = dynamic(() => import('@/components/three/HeroScene').then(m => ({ default: m.HeroScene })), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-gradient-radial from-neon-lime/5 to-transparent" />,
});

const liveCapabilities = [
  { icon: Database, label: 'Real uploads' },
  { icon: Radio, label: 'Live YouTube data' },
  { icon: Bot, label: 'Configured AI providers' },
  { icon: Server, label: 'Backend render queue' },
];

export function HeroSection() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], ['0%', '30%']);
  const opacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

  return (
    <section
      ref={ref}
      className="relative min-h-screen pt-24 flex items-center justify-center overflow-hidden"
    >
      {/* Animated 3D Background */}
      <HeroScene />

      {/* Background gradients */}
      <div className="absolute inset-0 bg-gradient-radial from-neon-lime/8 via-transparent to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-black to-transparent" />

      {/* Grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(rgba(163,230,53,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(163,230,53,0.5) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }}
      />

      <motion.div
        style={{ y, opacity }}
        className="relative z-10 max-w-6xl mx-auto px-6 text-center"
      >
        {/* Announcement Badge */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="flex justify-center mb-8"
        >
          <a
            href="#features"
            className="inline-flex items-center gap-2 px-4 py-2 glass rounded-full border border-neon-lime/20 text-sm text-neon-lime/80 hover:border-neon-lime/40 transition-all group"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Introducing AI Agent Automation</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
          </a>
        </motion.div>

        {/* Main Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.8 }}
          className="font-display text-6xl md:text-7xl lg:text-8xl font-bold leading-[1.05] tracking-tight mb-6"
        >
          <span className="text-white">Create like a</span>
          <br />
          <span className="text-gradient-lime">studio with AI</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.7 }}
          className="text-lg md:text-xl text-white/50 max-w-2xl mx-auto mb-10 leading-relaxed"
        >
          The most powerful AI creator platform for YouTube. Generate viral shorts, cinematic
          scenes, transcribe videos, and automate your entire content workflow — in minutes.
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.65 }}
          className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-16"
        >
          <Link href="/signup">
            <Button
              variant="primary"
              size="xl"
              leftIcon={<Zap className="w-5 h-5" />}
              className="shadow-glow-lime"
            >
              Start for free
            </Button>
          </Link>
          <button className="group flex items-center gap-3 text-white/70 hover:text-white transition-colors">
            <span className="w-12 h-12 rounded-full glass flex items-center justify-center border border-white/10 group-hover:border-neon-cyan/40 group-hover:shadow-glow-cyan transition-all">
              <Play className="w-5 h-5 ml-0.5" />
            </span>
            <span className="text-base font-medium">Watch overview</span>
          </button>
        </motion.div>

        {/* Live Capability Signals */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4"
        >
          {liveCapabilities.map((item) => {
            const Icon = item.icon;
            return (
            <div
              key={item.label}
              className="glass rounded-2xl p-5 border border-white/6 hover:border-neon-lime/20 transition-all group"
            >
              <Icon className="w-5 h-5 text-neon-lime mx-auto mb-3" />
              <p className="text-sm text-white/55">{item.label}</p>
            </div>
          )})}
        </motion.div>
      </motion.div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-white/30"
      >
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="w-px h-10 bg-gradient-to-b from-transparent via-neon-lime/50 to-transparent"
        />
        <span className="text-xs font-mono">scroll</span>
      </motion.div>
    </section>
  );
}
