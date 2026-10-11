'use client';
import { motion } from 'framer-motion';
import { useInView } from 'framer-motion';
import { useRef } from 'react';
import {
  Scissors,
  Clapperboard,
  Bot,
  Mic,
  TrendingUp,
  Upload,
  Zap,
  ArrowRight,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';

const features = [
  {
    icon: Scissors,
    color: 'lime',
    title: 'AI Shorts Generator',
    description:
      'Automatically detect viral moments in your long-form videos and generate perfectly-cut shorts with captions in any ratio.',
    tags: ['9:16', '1:1', '4:5'],
    href: '/studio/shorts',
  },
  {
    icon: Clapperboard,
    color: 'cyan',
    title: 'Cinematic AI Studio',
    description:
      'Generate stunning cinematic AI videos from text prompts with full camera movement control and motion presets.',
    tags: ['Text-to-Video', 'Camera Control', '4K'],
    href: '/studio/cinematic',
  },
  {
    icon: Mic,
    color: 'purple',
    title: 'Whisper Transcription',
    description:
      'Industry-leading accuracy with Whisper AI. Get timestamped transcripts, speaker detection, and auto-captions in 90+ languages.',
    tags: ['99% Accuracy', '90+ Languages', 'Real-time'],
    href: '/studio/shorts',
  },
  {
    icon: Bot,
    color: 'lime',
    title: 'AI Agent Automation',
    description:
      'Deploy specialized AI agents for trends, scripts, SEO, thumbnails, and even automated uploads to YouTube.',
    tags: ['6 Agents', 'Pipeline', 'Auto-pilot'],
    href: '/agents',
  },
  {
    icon: TrendingUp,
    color: 'cyan',
    title: 'Trend Intelligence',
    description:
      'Real-time YouTube trend analysis with AI-powered topic scoring. Always create content your audience is searching for.',
    tags: ['Real-time', 'Niche Analysis', 'SEO Score'],
    href: '/agents',
  },
  {
    icon: Upload,
    color: 'purple',
    title: 'Smart Upload Pipeline',
    description:
      'Schedule and auto-upload optimized videos with AI-generated titles, descriptions, tags, and thumbnails.',
    tags: ['Auto-schedule', 'SEO Optimized', 'Batch Upload'],
    href: '/agents',
  },
];

const colorMap = {
  lime: {
    icon: 'bg-neon-lime/10 text-neon-lime',
    border: 'hover:border-neon-lime/30 hover:shadow-glow-lime',
    tag: 'bg-neon-lime/10 text-neon-lime/80 border-neon-lime/20',
  },
  cyan: {
    icon: 'bg-neon-cyan/10 text-neon-cyan',
    border: 'hover:border-neon-cyan/30 hover:shadow-glow-cyan',
    tag: 'bg-neon-cyan/10 text-neon-cyan/80 border-neon-cyan/20',
  },
  purple: {
    icon: 'bg-neon-purple/10 text-neon-purple',
    border: 'hover:border-neon-purple/30 hover:shadow-glow-purple',
    tag: 'bg-neon-purple/10 text-neon-purple/80 border-neon-purple/20',
  },
};

function FeatureCard({ feature, index }: { feature: (typeof features)[0]; index: number }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-50px' });
  const colors = colorMap[feature.color as keyof typeof colorMap];
  const Icon = feature.icon;

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay: index * 0.1 }}
    >
      <Card
        variant="default"
        className={`group h-full flex flex-col border-white/6 transition-all duration-300 ${colors.border}`}
      >
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-5 ${colors.icon}`}>
          <Icon className="w-6 h-6" />
        </div>
        <h3 className="font-display text-xl font-semibold text-white mb-3 group-hover:text-neon-lime transition-colors">
          {feature.title}
        </h3>
        <p className="text-white/50 text-sm leading-relaxed mb-5 flex-1">{feature.description}</p>
        <div className="flex flex-wrap gap-2 mb-5">
          {feature.tags.map((tag) => (
            <span
              key={tag}
              className={`text-xs px-2.5 py-1 rounded-full border font-medium ${colors.tag}`}
            >
              {tag}
            </span>
          ))}
        </div>
        <a
          href={feature.href}
          className="flex items-center gap-1.5 text-sm font-medium text-white/40 group-hover:text-white transition-colors mt-auto"
        >
          Learn more <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
        </a>
      </Card>
    </motion.div>
  );
}

export function FeaturesSection() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });

  return (
    <section id="features" className="py-32 px-6 relative">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-radial from-neon-cyan/5 via-transparent to-transparent" />

      <div className="max-w-7xl mx-auto relative">
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7 }}
          className="text-center mb-20"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 glass rounded-full border border-neon-cyan/20 text-sm text-neon-cyan/80 mb-6">
            <Zap className="w-3.5 h-3.5" />
            POWERFUL AI TOOLS
          </div>
          <h2 className="font-display text-5xl md:text-6xl font-bold text-white mb-6 leading-tight">
            Everything you need to
            <br />
            <span className="text-gradient-lime">dominate YouTube</span>
          </h2>
          <p className="text-white/50 text-lg max-w-2xl mx-auto">
            A complete suite of AI tools designed for modern YouTube creators. From video
            processing to automated uploads — all in one platform.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
          {features.map((feature, i) => (
            <FeatureCard key={feature.title} feature={feature} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
