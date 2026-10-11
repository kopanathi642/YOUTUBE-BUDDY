'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Menu, X, Zap, ChevronDown, Video, ImageIcon, Mic, Bot,
  MonitorPlay, Clapperboard, LineChart, MessageSquare, BookOpen, FileText, LifeBuoy
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/context/AuthContext';
import { logout } from '@/lib/firebase';
import { cn } from '@/lib/utils';
import Image from 'next/image';

type DropdownItem = {
  label: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
};

const navLinks = [
  { label: 'Products', href: '#', hasDropdown: true, dropdownKey: 'products' },
  { label: 'AI Categories', href: '#', hasDropdown: true, dropdownKey: 'categories' },
  { label: 'Resources', href: '#', hasDropdown: true, dropdownKey: 'resources' },
  { label: 'Pricing', href: '/pricing' }
];

const productDropdown = [
  { label: 'Video Studio', desc: 'AI-powered short & long form videos', icon: Video, href: '/studio/shorts' },
  { label: 'Image Creator', desc: 'Generate thumbnails & assets', icon: ImageIcon, href: '/image' },
  { label: 'Voice AI', desc: 'Text-to-speech & cloning', icon: Mic, href: '/audio' },
  { label: 'AI Agents', desc: 'Automate scripting & SEO', icon: Bot, href: '/agents' }
];

const categoriesDropdown = [
  { label: 'Shorts & Reels', desc: 'Viral short-form AI generation', icon: MonitorPlay, href: '/studio/shorts' },
  { label: 'Cinematic Video', desc: 'Text-to-video & b-roll', icon: Clapperboard, href: '/studio/cinematic' },
  { label: 'SEO & Metadata', desc: 'Optimize titles & tags', icon: LineChart, href: '/agents' },
  { label: 'Scripting & Ideas', desc: 'AI scripting agents', icon: MessageSquare, href: '/agents' },
  { label: 'Thumbnails', desc: 'High-CTR image generation', icon: ImageIcon, href: '/image' },
  { label: 'Voiceovers', desc: 'Ultra-realistic voice cloning', icon: Mic, href: '/audio' }
];

const resourcesDropdown = [
  { label: 'Blog', desc: 'Latest YouTube strategies', icon: FileText, href: '#' },
  { label: 'Documentation', desc: 'API & Platform docs', icon: BookOpen, href: '#' },
  { label: 'Help Center', desc: 'Support & tutorials', icon: LifeBuoy, href: '#' }
];

const dropdowns: Record<string, DropdownItem[]> = {
  products: productDropdown,
  categories: categoriesDropdown,
  resources: resourcesDropdown
};

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const pathname = usePathname();
  const { user, profile, isAuthenticated } = useAuth();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleLogout = async () => {
    await logout();
  };

  return (
    <motion.nav
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className={cn(
        'fixed top-0 left-0 right-0 z-50 transition-all duration-500',
        scrolled || activeDropdown
          ? 'bg-[#0f0f11] border-b border-white/5 shadow-[0_4px_30px_rgba(0,0,0,0.5)]'
          : 'bg-[#0f0f11]/90 backdrop-blur-md border-b border-transparent'
      )}
      onMouseLeave={() => setActiveDropdown(null)}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 bg-neon-lime rounded-xl flex items-center justify-center shadow-glow-lime">
              <Zap className="w-4 h-4 text-black fill-black" />
            </div>
            <span className="font-display font-bold text-lg text-white tracking-wide">
              YouTube<span className="text-neon-lime">Buddy</span>
            </span>
          </Link>

          {/* Desktop Nav Links */}
          <div className="hidden md:flex items-center gap-8 absolute left-1/2 -translate-x-1/2">
            {navLinks.map((link) => (
              <div
                key={link.label}
                className="relative"
                onMouseEnter={() => link.hasDropdown ? setActiveDropdown(link.label) : setActiveDropdown(null)}
              >
                <Link
                  href={link.href}
                  className={cn(
                    'text-sm font-medium transition-colors flex items-center gap-1.5 py-2',
                    activeDropdown === link.label || pathname === link.href
                      ? 'text-neon-lime'
                      : 'text-white/70 hover:text-white'
                  )}
                >
                  {link.label}
                  {link.hasDropdown && (
                    <ChevronDown className={cn('w-4 h-4 transition-transform duration-200', activeDropdown === link.label && 'rotate-180')} />
                  )}
                </Link>

                {/* Dropdown Menu */}
                {link.hasDropdown && link.dropdownKey && (
                  <AnimatePresence>
                    {activeDropdown === link.label && (
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                        className={cn(
                          "absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-bg-secondary border border-white/10 rounded-2xl shadow-xl overflow-hidden p-2 grid",
                          link.dropdownKey === 'categories' ? "grid-cols-2 w-[550px] gap-2 p-3" : "w-[320px]"
                        )}
                      >
                        {dropdowns[link.dropdownKey]?.map((item) => {
                          const Icon = item.icon;
                          return (
                            <Link key={item.label} href={item.href} className="flex items-start gap-4 p-3 rounded-xl hover:bg-white/5 transition-colors group">
                              <div className="w-10 h-10 rounded-lg bg-neon-lime/10 flex items-center justify-center shrink-0 border border-neon-lime/20 group-hover:bg-neon-lime/20 transition-colors">
                                <Icon className="w-5 h-5 text-neon-lime" />
                              </div>
                              <div>
                                <h4 className="text-sm font-semibold text-white group-hover:text-neon-lime transition-colors">{item.label}</h4>
                                <p className="text-xs text-white/50 mt-0.5">{item.desc}</p>
                              </div>
                            </Link>
                          );
                        })}
                      </motion.div>
                    )}
                  </AnimatePresence>
                )}
              </div>
            ))}
          </div>

          {/* Right Actions */}
          <div className="hidden md:flex items-center gap-4">
            {isAuthenticated ? (
              <>
                <Link href="/dashboard">
                  <Button variant="secondary" size="sm" className="h-9">Dashboard</Button>
                </Link>
                <button onClick={handleLogout} className="flex items-center gap-2 group ml-2">
                  {profile?.photoURL ? (
                    <Image src={profile.photoURL} alt="Profile" width={36} height={36} className="rounded-full border-2 border-white/20 group-hover:border-neon-lime transition-colors" />
                  ) : (
                    <div className="w-9 h-9 bg-neon-lime/20 rounded-full flex items-center justify-center border-2 border-neon-lime/30 text-neon-lime font-bold">
                      {user?.email?.[0]?.toUpperCase() || 'U'}
                    </div>
                  )}
                </button>
              </>
            ) : (
              <>
                <Link href="/login">
                  <Button variant="ghost" size="sm" className="h-9">Sign in</Button>
                </Link>
                <Link href="/signup">
                  <Button variant="primary" size="sm" className="h-9 shadow-glow-lime">Get started free</Button>
                </Link>
              </>
            )}
          </div>

          {/* Mobile Toggle */}
          <button onClick={() => setMobileOpen(!mobileOpen)} className="md:hidden p-2 text-white/70 hover:text-white transition-colors" aria-label="Toggle menu">
            {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden border-t border-white/8 bg-bg-secondary/95 backdrop-blur-xl"
          >
            <div className="px-6 py-6 space-y-6">
              <div className="space-y-4">
                {navLinks.map((link) => (
                  <Link
                    key={link.label}
                    href={link.href}
                    onClick={() => setMobileOpen(false)}
                    className="block text-lg font-medium text-white/80 hover:text-white"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
              <div className="pt-6 flex flex-col gap-3 border-t border-white/8">
                {isAuthenticated ? (
                  <Link href="/dashboard" onClick={() => setMobileOpen(false)}>
                    <Button variant="primary" fullWidth className="h-11">Go to Dashboard</Button>
                  </Link>
                ) : (
                  <>
                    <Link href="/login" onClick={() => setMobileOpen(false)}>
                      <Button variant="secondary" fullWidth className="h-11">Sign in</Button>
                    </Link>
                    <Link href="/signup" onClick={() => setMobileOpen(false)}>
                      <Button variant="primary" fullWidth className="h-11 shadow-glow-lime">Get started free</Button>
                    </Link>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
}
