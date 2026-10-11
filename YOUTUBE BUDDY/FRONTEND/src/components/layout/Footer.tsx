'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Zap, Twitter, Github, Youtube, Linkedin } from 'lucide-react';

const footerLinks = {
  Product: [
    { label: 'AI Shorts Studio', href: '/studio/shorts' },
    { label: 'Cinematic AI', href: '/studio/cinematic' },
    { label: 'AI Agents', href: '/agents' },
    { label: 'Pricing', href: '/pricing' },
  ],
  Company: [
    { label: 'About', href: '/about' },
    { label: 'Blog', href: '/blog' },
    { label: 'Careers', href: '/careers' },
    { label: 'Contact', href: '/contact' },
  ],
  Legal: [
    { label: 'Privacy Policy', href: '/privacy' },
    { label: 'Terms of Service', href: '/terms' },
    { label: 'Cookie Policy', href: '/cookies' },
  ],
  Resources: [
    { label: 'Documentation', href: '/docs' },
    { label: 'API Reference', href: '/api-docs' },
    { label: 'Changelog', href: '/changelog' },
    { label: 'Status', href: '/status' },
  ],
};

const socials = [
  { icon: Twitter, href: '#', label: 'Twitter' },
  { icon: Youtube, href: '#', label: 'YouTube' },
  { icon: Github, href: '#', label: 'GitHub' },
  { icon: Linkedin, href: '#', label: 'LinkedIn' },
];

export function Footer() {
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <footer className="border-t border-white/6 bg-bg-secondary" suppressHydrationWarning>
      {/* CTA Banner */}
      <div className="relative overflow-hidden" suppressHydrationWarning>
        <div className="absolute inset-0 bg-gradient-radial from-neon-lime/5 via-transparent to-transparent" suppressHydrationWarning />
        <div className="relative max-w-7xl mx-auto px-6 py-20 text-center">
          <p className="text-sm font-mono text-neon-lime/70 mb-4">START TODAY</p>
          <h2 className="font-display text-4xl md:text-5xl font-bold text-white mb-6 leading-tight">
            Build your creator empire
            <br />
            <span className="text-gradient-lime">with AI.</span>
          </h2>
          <p className="text-white/50 text-lg mb-8 max-w-xl mx-auto">
            Join thousands of creators automating their YouTube workflow with YouTube Buddy.
          </p>
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 px-8 py-4 bg-neon-lime text-black font-bold rounded-xl hover:bg-lime-300 transition-all duration-200 shadow-glow-lime hover:shadow-[0_0_40px_rgba(163,230,53,0.5)] active:scale-95"
          >
            <Zap className="w-5 h-5" />
            Get started — it&apos;s free
          </Link>
        </div>
      </div>

      {/* Links Grid */}
      <div className="max-w-7xl mx-auto px-6 py-16 border-t border-white/6">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-8">
          {/* Brand */}
          <div className="col-span-2 md:col-span-2">
            <Link href="/" className="flex items-center gap-2.5 mb-4 group">
              <div className="w-8 h-8 bg-neon-lime rounded-lg flex items-center justify-center shadow-glow-lime">
                <Zap className="w-4 h-4 text-black fill-black" />
              </div>
              <span className="font-display font-bold text-lg">
                YouTube<span className="text-neon-lime">Buddy</span>
              </span>
            </Link>
            <p className="text-white/40 text-sm leading-relaxed max-w-xs">
              The most advanced AI creator platform for automating and growing your YouTube presence.
            </p>
            <div className="flex gap-3 mt-6">
              {socials.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  aria-label={s.label}
                  className="w-9 h-9 rounded-lg glass flex items-center justify-center text-white/40 hover:text-neon-lime hover:border-neon-lime/30 transition-all"
                >
                  <s.icon className="w-4 h-4" />
                </a>
              ))}
            </div>
          </div>

          {/* Links */}
          {Object.entries(footerLinks).map(([title, links]) => (
            <div key={title}>
              <h4 className="text-xs font-semibold text-white/30 uppercase tracking-widest mb-4">
                {title}
              </h4>
              <ul className="space-y-2.5">
                {links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-white/50 hover:text-white transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 mt-16 pt-8 border-t border-white/6">
          <p className="text-sm text-white/25">
            © {mounted ? new Date().getFullYear() : '2025'} YouTube Buddy. All rights reserved.
          </p>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-neon-lime rounded-full shadow-[0_0_6px_rgba(163,230,53,0.8)]" />
            <span className="text-xs text-white/30">All systems operational</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
