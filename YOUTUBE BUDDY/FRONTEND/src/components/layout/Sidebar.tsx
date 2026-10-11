'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  Video,
  Scissors,
  Bot,
  BarChart3,
  Settings,
  User,
  Zap,
  ChevronLeft,
  CreditCard,
  Mic,
  Camera,
  TrendingUp,
  Shirt,
  ImageIcon,
  PenTool,
  Layers,
  Smile,
  Users,
  Eye,
  SunMedium,
  Eraser,
  Maximize,
  RefreshCw,
  Replace,
  Pencil,
  Film,
  MousePointerClick,
  Palette,
  Sparkles,
  MonitorPlay,
  Briefcase,
  Globe,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import Image from 'next/image';
import { useState } from 'react';

type SidebarItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
};

type SidebarSection = {
  label: string;
  items: SidebarItem[];
};

const navSections: SidebarSection[] = [
  {
    label: 'Main',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
      { label: 'Explore', href: '/explore', icon: Globe },
      { label: 'My Videos', href: '/dashboard/videos', icon: Video },
    ],
  },
  {
    label: 'Images',
    items: [
      { label: 'AI Image Generator', href: '/image/create', icon: ImageIcon },
      { label: 'Cinematic Photos', href: '/image/cineshot', icon: Camera, badge: 'TOP' },
      { label: 'AI Moodboard', href: '/image/moodboard', icon: Layers },
      { label: 'Character Designer', href: '/image/character', icon: Smile },
      { label: 'Influencer Creator', href: '/image/persona', icon: Users },
      { label: 'Style Finder', href: '/image/aesthetic', icon: Eye, badge: 'NEW' },
      { label: 'Photo Lighting', href: '/image/relight', icon: SunMedium },
      { label: 'Object Eraser', href: '/image/inpaint', icon: Eraser },
      { label: 'Photo Upscaler', href: '/image/upscale', icon: Maximize },
      { label: 'Face Swapper', href: '/image/faceswap', icon: RefreshCw },
      { label: 'Replace Character', href: '/image/charswap', icon: Replace },
      { label: 'Sketch to Art', href: '/image/draw', icon: Pencil },
      { label: 'Fashion Designer', href: '/image/fashion', icon: Shirt },
    ],
  },
  {
    label: 'Videos',
    items: [
      { label: 'AI Video Generator', href: '/studio/create', icon: Video },
      { label: 'Cinematic Video', href: '/studio/cinematic', icon: Film, badge: 'TOP' },
      { label: 'Viral Shorts Creator', href: '/studio/shorts', icon: Scissors, badge: 'HOT' },
      { label: 'Video Idea Canvas', href: '/studio/canvas', icon: PenTool, badge: 'NEW' },
      { label: 'Trending Topics', href: '/studio/trends', icon: TrendingUp, badge: 'HOT' },
      { label: 'Style Blender', href: '/studio/mixed', icon: Layers },
      { label: 'AI Video Editor', href: '/studio/edit', icon: Scissors },
      { label: 'Video Ad Maker', href: '/studio/ads', icon: MousePointerClick },
      { label: 'Lip Sync AI', href: '/studio/lipsync', icon: Mic },
      { label: 'Sketch to Video', href: '/studio/draw', icon: Pencil },
      { label: 'Drawing to Video', href: '/studio/sketch', icon: Palette },
      { label: 'AI Human Presenter', href: '/studio/ugc', icon: Users },
      { label: '4K Video Upscaler', href: '/studio/upscale', icon: Maximize },
      { label: 'Video Animation', href: '/studio/animate', icon: Sparkles },
      { label: 'Motion Graphics', href: '/studio/motion', icon: MonitorPlay },
      { label: 'Replace Actor', href: '/studio/recast', icon: Replace },
    ],
  },
  {
    label: 'Audio',
    items: [
      { label: 'AI Voice Generator', href: '/audio/voiceover', icon: Mic },
      { label: 'Voice Changer', href: '/audio/changevoice', icon: RefreshCw },
      { label: 'Audio Translator', href: '/audio/translation', icon: Replace },
    ],
  },
  {
    label: 'Growth & Collab',
    items: [
      { label: 'Collab Network', href: '/collab', icon: Users },
      { label: 'Marketing Kit', href: '/marketing', icon: Briefcase },
      { label: 'AI Agents', href: '/agents', icon: Bot },
    ],
  },
  {
    label: 'Account',
    items: [
      { label: 'Analytics', href: '/dashboard/analytics', icon: BarChart3 },
      { label: 'Profile', href: '/profile', icon: User },
      { label: 'Billing', href: '/profile/billing', icon: CreditCard },
      { label: 'Settings', href: '/profile/settings', icon: Settings },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, profile } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 72 : 240 }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
      className="relative flex flex-col h-screen bg-bg-secondary border-r border-white/6 shrink-0 overflow-hidden"
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-white/6 shrink-0">
        <div className="w-8 h-8 bg-neon-lime rounded-lg flex items-center justify-center shadow-glow-lime shrink-0">
          <Zap className="w-4 h-4 text-black fill-black" />
        </div>
        {!collapsed && (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="font-display font-bold text-base tracking-tight whitespace-nowrap"
          >
            YouTube<span className="text-neon-lime">Buddy</span>
          </motion.span>
        )}
      </div>

      {/* Nav Sections */}
      <nav className="flex-1 overflow-y-auto scrollbar-thin py-4 px-3 space-y-6">
        {navSections.map((section) => (
          <div key={section.label} className="space-y-1">
            {!collapsed && (
              <p className="px-3 mb-2 text-[10px] font-medium text-white/25 uppercase tracking-widest">
                {section.label}
              </p>
            )}
            {section.items.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <Link key={item.href} href={item.href}>
                  <span
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group relative',
                      isActive
                        ? 'bg-neon-lime/10 text-neon-lime border border-neon-lime/20'
                        : 'text-white/50 hover:text-white hover:bg-white/5'
                    )}
                  >
                    <Icon
                      className={cn(
                        'w-4.5 h-4.5 shrink-0 transition-colors',
                        isActive ? 'text-neon-lime' : 'text-white/40 group-hover:text-white'
                      )}
                    />
                    {!collapsed && (
                      <div className="flex items-center justify-between flex-1 w-full overflow-hidden">
                        <span className="text-sm font-medium whitespace-nowrap overflow-hidden text-ellipsis">{item.label}</span>
                        {(item.badge) && (
                          <span className={cn(
                            'text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 ml-2 uppercase tracking-wider',
                            item.badge === 'TOP' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-neon-lime/20 text-neon-lime border border-neon-lime/30'
                          )}>
                            {item.badge}
                          </span>
                        )}
                      </div>
                    )}
                    {isActive && (
                      <motion.div
                        layoutId="sidebar-active"
                        className="absolute inset-0 rounded-xl bg-neon-lime/5"
                        transition={{ duration: 0.2 }}
                      />
                    )}
                  </span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* User Profile */}
      <div className="shrink-0 p-3 border-t border-white/6">
        <Link href="/profile">
          <div className="flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-white/5 transition-colors cursor-pointer">
            {profile?.photoURL ? (
              <Image
                src={profile.photoURL}
                alt="Avatar"
                width={32}
                height={32}
                className="rounded-full border border-white/20 shrink-0"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-neon-lime/20 border border-neon-lime/30 flex items-center justify-center text-neon-lime text-xs font-bold shrink-0">
                {user?.email?.[0]?.toUpperCase() || 'U'}
              </div>
            )}
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white truncate">
                  {profile?.displayName || user?.email?.split('@')[0] || 'User'}
                </p>
                <p className="text-xs text-white/35 truncate capitalize">
                  {profile?.plan || 'Free'} plan
                </p>
              </div>
            )}
          </div>
        </Link>
      </div>

      {/* Collapse Toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute top-1/2 -right-3 w-6 h-6 bg-bg-secondary border border-white/10 rounded-full flex items-center justify-center text-white/40 hover:text-white hover:border-white/30 transition-all z-10"
        aria-label="Toggle sidebar"
      >
        <ChevronLeft
          className={cn('w-3 h-3 transition-transform duration-300', collapsed && 'rotate-180')}
        />
      </button>
    </motion.aside>
  );
}
