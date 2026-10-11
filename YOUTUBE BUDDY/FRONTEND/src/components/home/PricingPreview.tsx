'use client';
import { motion, useInView } from 'framer-motion';
import { useState, useEffect, useRef } from 'react';
import { Check, Zap, ArrowRight } from 'lucide-react';
import Link from 'next/link';

const plans = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    desc: 'Perfect to get started',
    features: ['5 videos/month', '10 shorts/month', '5GB storage', 'Basic transcription', '720p exports'],
    cta: 'Get started free',
    href: '/signup',
    accent: 'white',
  },
  {
    id: 'creator',
    name: 'Creator',
    price: 29,
    desc: 'For growing creators',
    features: ['50 videos/month', '200 shorts/month', '100GB storage', 'Whisper Pro transcription', '4K exports', '3 AI agents', 'Priority processing'],
    cta: 'Start Creator plan',
    href: '/signup?plan=creator',
    accent: 'lime',
    popular: true,
  },
  {
    id: 'pro',
    name: 'Pro Studio',
    price: 79,
    desc: 'For serious creators',
    features: ['Unlimited videos', 'Unlimited shorts', '1TB storage', 'All 6 AI agents', 'Cinematic AI studio', 'Auto-upload pipeline', 'API access', 'White-label exports'],
    cta: 'Start Pro plan',
    href: '/signup?plan=pro',
    accent: 'cyan',
  },
];

export function PricingPreview() {
  const [mounted, setMounted] = useState(false);
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <section className="py-32 px-6 relative" suppressHydrationWarning>
      <div className="absolute inset-0 bg-gradient-radial from-neon-purple/5 via-transparent to-transparent" suppressHydrationWarning />

      <div className="max-w-7xl mx-auto relative">
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 30 }}
          animate={(mounted && inView) ? { opacity: 1, y: 0 } : {}}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 glass rounded-full border border-neon-purple/20 text-sm text-neon-purple/80 mb-6">
            <Zap className="w-3.5 h-3.5" />
            SIMPLE PRICING
          </div>
          <h2 className="font-display text-5xl font-bold text-white mb-4">
            Start free, scale as you grow
          </h2>
          <p className="text-white/50 text-lg">No hidden fees. Cancel anytime.</p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {plans.map((plan, i) => (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 40 }}
              animate={(mounted && inView) ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: i * 0.15 }}
              className={`relative rounded-2xl border p-8 transition-all duration-300 ${
                plan.popular
                  ? 'bg-neon-lime/5 border-neon-lime/30 shadow-glow-lime'
                  : 'glass border-white/8 hover:border-white/15'
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="px-4 py-1 bg-neon-lime text-black text-xs font-bold rounded-full">
                    MOST POPULAR
                  </span>
                </div>
              )}
              <p className="text-white/50 text-sm mb-2">{plan.name}</p>
              <div className="flex items-end gap-1 mb-1">
                <span className="font-display text-5xl font-bold text-white">
                  {plan.price === 0 ? 'Free' : `$${plan.price}`}
                </span>
                {plan.price > 0 && <span className="text-white/40 text-sm mb-2">/mo</span>}
              </div>
              <p className="text-white/40 text-sm mb-8">{plan.desc}</p>
              <ul className="space-y-3 mb-8">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2.5 text-sm text-white/70">
                    <Check className="w-4 h-4 text-neon-lime shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link href={plan.href}>
                <button
                  className={`w-full py-3 px-6 rounded-xl font-semibold text-sm transition-all duration-200 ${
                    plan.popular
                      ? 'bg-neon-lime text-black hover:bg-lime-300 shadow-glow-lime'
                      : 'glass border border-white/15 text-white hover:border-white/30'
                  }`}
                >
                  {plan.cta}
                </button>
              </Link>
            </motion.div>
          ))}
        </div>

        <div className="text-center">
          <Link
            href="/pricing"
            className="inline-flex items-center gap-2 text-neon-lime/80 hover:text-neon-lime text-sm font-medium transition-colors group"
          >
            See full pricing comparison
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
      </div>
    </section>
  );
}
