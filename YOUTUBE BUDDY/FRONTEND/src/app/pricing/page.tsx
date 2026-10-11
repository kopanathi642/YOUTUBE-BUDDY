'use client';
import { useState } from 'react';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { motion } from 'framer-motion';
import { Check, Zap, Building2, Sparkles } from 'lucide-react';
import Link from 'next/link';

const plans = [
  {
    id: 'free',
    name: 'Free',
    monthly: 0,
    annual: 0,
    desc: 'Perfect for getting started with AI tools',
    icon: Sparkles,
    color: 'white',
    features: [
      '5 video uploads/month',
      '10 AI shorts/month',
      '5GB cloud storage',
      'Basic Whisper transcription',
      '720p exports',
      'Community support',
    ],
    limits: { videos: 5, shorts: 10, storage: '5GB', agents: 0 },
    cta: 'Start for free',
    href: '/signup',
  },
  {
    id: 'creator',
    name: 'Creator',
    monthly: 29,
    annual: 23,
    desc: 'For creators ready to grow their channel faster',
    icon: Zap,
    color: 'lime',
    popular: true,
    features: [
      '50 video uploads/month',
      '200 AI shorts/month',
      '100GB cloud storage',
      'Whisper Pro transcription',
      '4K exports',
      '3 AI agents (Trend, Script, SEO)',
      'Priority processing queue',
      'Email support',
    ],
    limits: { videos: 50, shorts: 200, storage: '100GB', agents: 3 },
    cta: 'Start Creator plan',
    href: '/signup?plan=creator',
  },
  {
    id: 'pro',
    name: 'Pro Studio',
    monthly: 79,
    annual: 63,
    desc: 'For professional creators and agencies',
    icon: Sparkles,
    color: 'cyan',
    features: [
      'Unlimited video uploads',
      'Unlimited AI shorts',
      '1TB cloud storage',
      'All 6 AI agents',
      'Cinematic AI Studio',
      'Auto-upload pipeline',
      'Full API access',
      'White-label exports',
      'Analytics dashboard',
      'Priority support',
    ],
    limits: { videos: -1, shorts: -1, storage: '1TB', agents: 6 },
    cta: 'Start Pro Studio',
    href: '/signup?plan=pro',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    monthly: null,
    annual: null,
    desc: 'Custom solution for media companies and teams',
    icon: Building2,
    color: 'purple',
    features: [
      'Unlimited everything',
      'Custom AI model fine-tuning',
      'Dedicated infrastructure',
      'Custom agent workflows',
      'SLA guarantees',
      'SSO & SAML',
      'Advanced analytics',
      'Dedicated success manager',
      'Custom onboarding',
    ],
    limits: { videos: -1, shorts: -1, storage: 'Custom', agents: -1 },
    cta: 'Contact sales',
    href: '/contact',
  },
];

const featureComparison = [
  { feature: 'Video uploads/month', free: '5', creator: '50', pro: 'Unlimited', enterprise: 'Unlimited' },
  { feature: 'AI shorts generation', free: '10/mo', creator: '200/mo', pro: 'Unlimited', enterprise: 'Unlimited' },
  { feature: 'Cloud storage', free: '5GB', creator: '100GB', pro: '1TB', enterprise: 'Custom' },
  { feature: 'Export quality', free: '720p', creator: '4K', pro: '4K+', enterprise: '8K' },
  { feature: 'AI agents', free: '—', creator: '3', pro: '6', enterprise: 'Custom' },
  { feature: 'Cinematic AI Studio', free: false, creator: false, pro: true, enterprise: true },
  { feature: 'API access', free: false, creator: false, pro: true, enterprise: true },
  { feature: 'Auto-upload pipeline', free: false, creator: false, pro: true, enterprise: true },
  { feature: 'White-label exports', free: false, creator: false, pro: true, enterprise: true },
  { feature: 'Custom AI fine-tuning', free: false, creator: false, pro: false, enterprise: true },
  { feature: 'SSO / SAML', free: false, creator: false, pro: false, enterprise: true },
  { feature: 'SLA guarantee', free: false, creator: false, pro: false, enterprise: true },
  { feature: 'Support', free: 'Community', creator: 'Email', pro: 'Priority', enterprise: 'Dedicated' },
];

const colorMap: Record<string, { border: string; bg: string; btn: string; icon: string }> = {
  white: {
    border: 'border-white/10 hover:border-white/20',
    bg: '',
    btn: 'glass border border-white/15 text-white hover:border-white/30',
    icon: 'bg-white/10 text-white',
  },
  lime: {
    border: 'border-neon-lime/25 shadow-glow-lime',
    bg: 'bg-neon-lime/3',
    btn: 'bg-neon-lime text-black hover:bg-lime-300 shadow-glow-lime',
    icon: 'bg-neon-lime/15 text-neon-lime',
  },
  cyan: {
    border: 'border-neon-cyan/25 hover:border-neon-cyan/40',
    bg: 'bg-neon-cyan/3',
    btn: 'bg-neon-cyan text-black hover:bg-cyan-300 shadow-glow-cyan',
    icon: 'bg-neon-cyan/15 text-neon-cyan',
  },
  purple: {
    border: 'border-neon-purple/25 hover:border-neon-purple/40',
    bg: 'bg-neon-purple/3',
    btn: 'border border-neon-purple/40 text-neon-purple hover:bg-neon-purple/10',
    icon: 'bg-neon-purple/15 text-neon-purple',
  },
};

export default function PricingPage() {
  const [annual, setAnnual] = useState(false);

  return (
    <div className="min-h-screen bg-bg-primary">
      <Navbar />
      <main>
        {/* Hero */}
        <section className="pt-32 pb-20 px-6 text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-radial from-neon-purple/6 via-transparent to-transparent" />
          <div className="relative max-w-3xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 glass rounded-full border border-neon-purple/20 text-sm text-neon-purple/80 mb-6">
                <Zap className="w-3.5 h-3.5" />
                PRICING
              </div>
              <h1 className="font-display text-6xl font-bold text-white mb-6">
                Simple, transparent
                <br />
                <span className="text-gradient-lime">pricing</span>
              </h1>
              <p className="text-white/50 text-lg mb-10">
                Start free. Scale as you grow. No hidden fees, no surprises.
              </p>

              {/* Annual toggle */}
              <div className="flex items-center justify-center gap-4">
                <span className={`text-sm ${!annual ? 'text-white' : 'text-white/40'}`}>Monthly</span>
                <button
                  onClick={() => setAnnual(!annual)}
                  className={`w-14 h-7 rounded-full transition-all duration-300 relative ${
                    annual ? 'bg-neon-lime' : 'bg-white/15'
                  }`}
                >
                  <span
                    className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-transform duration-300 ${
                      annual ? 'translate-x-8' : 'translate-x-1'
                    }`}
                  />
                </button>
                <div className="flex items-center gap-2">
                  <span className={`text-sm ${annual ? 'text-white' : 'text-white/40'}`}>Annual</span>
                  <span className="px-2 py-0.5 bg-neon-lime/10 text-neon-lime text-xs font-medium rounded-full border border-neon-lime/20">
                    Save 20%
                  </span>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Plan Cards */}
        <section className="px-6 pb-20">
          <div className="max-w-7xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
              {plans.map((plan, i) => {
                const colors = colorMap[plan.color];
                const Icon = plan.icon;
                const price = annual ? plan.annual : plan.monthly;

                return (
                  <motion.div
                    key={plan.id}
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className={`relative rounded-2xl border p-7 flex flex-col transition-all duration-300 ${colors.border} ${colors.bg}`}
                  >
                    {plan.popular && (
                      <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                        <span className="px-4 py-1.5 bg-neon-lime text-black text-xs font-bold rounded-full shadow-glow-lime">
                          MOST POPULAR
                        </span>
                      </div>
                    )}

                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-5 ${colors.icon}`}>
                      <Icon className="w-5.5 h-5.5" size={22} />
                    </div>

                    <h2 className="font-display text-xl font-bold text-white mb-1">{plan.name}</h2>
                    <p className="text-sm text-white/40 mb-6">{plan.desc}</p>

                    <div className="mb-6">
                      {price === null ? (
                        <div className="flex items-end gap-1">
                          <span className="font-display text-3xl font-bold text-white">Custom</span>
                        </div>
                      ) : (
                        <div className="flex items-end gap-1">
                          <span className="font-display text-4xl font-bold text-white">
                            {price === 0 ? 'Free' : `$${price}`}
                          </span>
                          {price > 0 && (
                            <span className="text-white/40 text-sm mb-1.5">
                              /mo{annual ? ' billed annually' : ''}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <Link href={plan.href}>
                      <button
                        className={`w-full py-3 px-5 rounded-xl font-semibold text-sm transition-all duration-200 mb-8 ${colors.btn}`}
                      >
                        {plan.cta}
                      </button>
                    </Link>

                    <ul className="space-y-3 flex-1">
                      {plan.features.map((f) => (
                        <li key={f} className="flex items-start gap-2.5 text-sm text-white/60">
                          <Check className="w-4 h-4 text-neon-lime shrink-0 mt-0.5" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Feature Comparison Table */}
        <section className="px-6 pb-32">
          <div className="max-w-5xl mx-auto">
            <h2 className="font-display text-3xl font-bold text-white text-center mb-10">
              Full feature comparison
            </h2>
            <div className="glass border border-white/8 rounded-2xl overflow-hidden">
              {/* Header */}
              <div className="grid grid-cols-5 border-b border-white/8">
                <div className="p-5 text-sm font-medium text-white/30">Feature</div>
                {['Free', 'Creator', 'Pro Studio', 'Enterprise'].map((p) => (
                  <div key={p} className="p-5 text-sm font-semibold text-white text-center">{p}</div>
                ))}
              </div>
              {featureComparison.map((row, i) => (
                <div
                  key={row.feature}
                  className={`grid grid-cols-5 border-b border-white/5 hover:bg-white/2 transition-colors ${
                    i === featureComparison.length - 1 ? 'border-0' : ''
                  }`}
                >
                  <div className="p-4 text-sm text-white/60">{row.feature}</div>
                  {(['free', 'creator', 'pro', 'enterprise'] as const).map((tier) => {
                    const val = row[tier];
                    return (
                      <div key={tier} className="p-4 text-sm text-center flex items-center justify-center">
                        {typeof val === 'boolean' ? (
                          val ? (
                            <Check className="w-4 h-4 text-neon-lime" />
                          ) : (
                            <span className="text-white/20">—</span>
                          )
                        ) : (
                          <span className="text-white/70">{val}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
