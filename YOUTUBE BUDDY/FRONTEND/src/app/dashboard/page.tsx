'use client';
import { useState, useMemo, useEffect, lazy, Suspense } from 'react';
import Image from 'next/image';
import { Sidebar } from '@/components/layout/Sidebar';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { fetchYouTubeChannelStats, fetchYouTubeRecentVideos, YouTubeChannelStats, YouTubeVideoStats } from '@/lib/youtube';
import { api } from '@/lib/api';

import { motion } from 'framer-motion';
import {
  Eye,
  Users,
  TrendingUp,
  Clock,
  Play,
  MoreVertical,
  Video,
  Film,
  Bot,
  Wand2,
  Mic,
  Camera,
  Shirt,
  Youtube,
  User,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { connectYouTubeAccount, isYouTubeTokenValid, disconnectYouTube } from '@/lib/firebase';
import { formatNumber } from '@/lib/utils';
import toast from 'react-hot-toast';

// Lazy load heavy components
const AnalyticsChart = lazy(() => import('@/components/dashboard/AnalyticsChart').then(mod => ({ default: mod.AnalyticsChart })));
const RenderQueue = lazy(() => import('@/components/dashboard/RenderQueue').then(mod => ({ default: mod.RenderQueue })));
const AgentActivity = lazy(() => import('@/components/dashboard/AgentActivity').then(mod => ({ default: mod.AgentActivity })));

// Loading component
const LoadingSpinner = () => (
  <div className="flex items-center justify-center p-8">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
  </div>
);

type UploadRow = {
  id: number;
  filename: string;
  preview_url?: string | null;
  size_bytes: number;
  duration_seconds?: number | null;
  created_at: string;
};

type OverviewStats = {
  totalVideos: number;
  totalShorts: number;
  activeJobs: number;
  storageUsed: number;
};

export default function DashboardPage() {
  const { user, profile } = useAuth();
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  
  const displayName = profile?.displayName || user?.email?.split('@')[0] || 'Creator';

  const [ytStats, setYtStats] = useState<YouTubeChannelStats | null>(null);
  const [ytVideos, setYtVideos] = useState<YouTubeVideoStats[]>([]);
  const [loadingStats, setLoadingStats] = useState(true);
  const [overview, setOverview] = useState<OverviewStats | null>(null);
  const [videos, setVideos] = useState<UploadRow[]>([]);
  const [loadingVideos, setLoadingVideos] = useState(true);

  useEffect(() => {
    async function loadData() {
      const hasYtToken = isYouTubeTokenValid();
      setIsConnected(hasYtToken);

      const [youtubeResult, ytVideosResult, videosResult, overviewResult] = await Promise.allSettled([
        hasYtToken ? fetchYouTubeChannelStats() : Promise.resolve(null),
        hasYtToken ? fetchYouTubeRecentVideos(10) : Promise.resolve([]),
        api.videos.list(),
        api.analytics.overview(),
      ]);

      if (youtubeResult.status === 'fulfilled') {
        setYtStats(youtubeResult.value);
      }
      if (ytVideosResult.status === 'fulfilled') {
        setYtVideos(ytVideosResult.value || []);
      }
      setLoadingStats(false);

      if (videosResult.status === 'fulfilled') {
        setVideos(videosResult.value.data || []);
      } else {
        console.error('Failed to fetch videos:', videosResult.reason);
      }

      if (overviewResult.status === 'fulfilled') {
        setOverview(overviewResult.value.data);
      }

      setLoadingVideos(false);
    }
    loadData();
  }, []);

  const stats = useMemo(() => [
    {
      label: 'Total Views',
      value: ytStats ? ytStats.viewCount : 0,
      source: ytStats ? 'YouTube live' : 'Connect YouTube',
      icon: Eye,
      color: 'lime',
    },
    {
      label: 'Subscribers',
      value: ytStats ? ytStats.subscriberCount : 0,
      source: ytStats ? 'YouTube live' : 'Connect YouTube',
      icon: Users,
      color: 'cyan',
    },
    {
      label: 'Uploaded Videos',
      value: overview?.totalVideos ?? videos.length,
      source: 'Backend database',
      icon: Video,
      color: 'purple',
    },
    {
      label: 'Generated Shorts',
      value: overview?.totalShorts ?? 0,
      source: 'Backend database',
      icon: TrendingUp,
      color: 'lime',
    },
  ], [overview, videos.length, ytStats]);

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      await connectYouTubeAccount();
      setIsConnected(true);
      // Fetch live data immediately after connecting
      const [channelData, videosData] = await Promise.allSettled([
        fetchYouTubeChannelStats(),
        fetchYouTubeRecentVideos(10),
      ]);
      if (channelData.status === 'fulfilled') setYtStats(channelData.value);
      if (videosData.status === 'fulfilled') setYtVideos(videosData.value || []);
      toast.success('YouTube account connected successfully!');
      setShowConnectModal(false);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to connect YouTube account';
      toast.error(errorMessage);
      console.warn('YouTube connection error:', error);
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <ProtectedRoute>
      <div className="flex h-screen bg-bg-primary overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto scrollbar-thin">
          {/* Top Bar */}
          <div className="sticky top-0 z-20 border-b border-white/6 bg-bg-primary/80 backdrop-blur-xl px-8 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="font-display text-xl font-bold text-white">
                  Welcome back, {displayName} 👋
                </h1>
                <p className="text-sm text-white/40">Here&apos;s what&apos;s happening with your channel.</p>
              </div>
              <div className="flex items-center gap-4">
                {!isConnected ? (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="border border-neon-lime/30 text-neon-lime hover:bg-neon-lime/10 hover:text-neon-lime" 
                    leftIcon={<Youtube className="w-4 h-4" />}
                    onClick={() => setShowConnectModal(true)}
                  >
                    Connect YouTube
                  </Button>
                ) : (
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="border border-green-500/30 text-green-400 bg-green-500/5 cursor-default" 
                      leftIcon={<Youtube className="w-4 h-4" />}
                    >
                      Channel Connected
                    </Button>
                    <button 
                      onClick={() => {
                        disconnectYouTube();
                        setIsConnected(false);
                        setYtStats(null);
                        setYtVideos([]);
                      }}
                      className="text-[10px] text-white/20 hover:text-red-400 transition-colors uppercase tracking-wider font-bold"
                    >
                      Disconnect
                    </button>
                  </div>
                )}
                <Link href="/profile">
                  <div className="w-10 h-10 rounded-full border-2 border-white/10 bg-bg-secondary flex items-center justify-center overflow-hidden cursor-pointer hover:border-white/30 transition-colors shrink-0 relative">
                    {user?.photoURL ? (
                      <Image src={user.photoURL} alt="Profile" fill className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-5 h-5 text-white/40" />
                    )}
                  </div>
                </Link>
              </div>
            </div>
          </div>

          <div className="px-8 py-6 space-y-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {stats.map((stat, i) => {
                const Icon = stat.icon;
                const isYouTubeStat = stat.source !== 'Backend database';
                const isLoadingValue = isYouTubeStat ? loadingStats : loadingVideos;
                
                return (
                  <motion.div
                    key={stat.label}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.08 }}
                    className="glass border border-white/8 rounded-2xl p-5 hover:border-white/15 transition-all group relative overflow-hidden"
                  >
                    <div className="flex items-start justify-between mb-4 relative z-10">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/5 border border-white/10">
                        <Icon className="w-5 h-5 text-white" />
                      </div>
                      <span className="text-[10px] uppercase tracking-wider text-white/30">{stat.source}</span>
                    </div>
                    <p className="font-display text-3xl font-bold text-white mb-1 relative z-10">
                      {isLoadingValue ? '...' : (typeof stat.value === 'number' ? formatNumber(stat.value) : stat.value)}
                    </p>
                    <p className="text-xs text-white/40 relative z-10">{stat.label}</p>
                  </motion.div>
                );
              })}
            </div>

            {/* Quick AI Tools - Four Curved Boxes */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Link href="/studio/shorts">
                <motion.div
                  whileHover={{ scale: 1.02, y: -2 }}
                  className="glass-dark border border-white/10 rounded-3xl p-6 hover:border-neon-lime/30 hover:shadow-glow-lime transition-all h-full group relative overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-neon-lime/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="w-12 h-12 rounded-2xl bg-neon-lime/10 flex items-center justify-center mb-4 border border-neon-lime/20 relative z-10">
                    <Video className="w-6 h-6 text-neon-lime" />
                  </div>
                  <h3 className="font-display font-semibold text-white text-lg mb-1 relative z-10">Shorts Studio</h3>
                  <p className="text-sm text-white/50 relative z-10">Turn ideas into viral short-form content automatically.</p>
                </motion.div>
              </Link>
              
              <Link href="/studio/cinematic">
                <motion.div
                  whileHover={{ scale: 1.02, y: -2 }}
                  className="glass-dark border border-white/10 rounded-3xl p-6 hover:border-neon-cyan/30 hover:shadow-[0_0_20px_rgba(0,255,255,0.15)] transition-all h-full group relative overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-neon-cyan/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="w-12 h-12 rounded-2xl bg-neon-cyan/10 flex items-center justify-center mb-4 border border-neon-cyan/20 relative z-10">
                    <Film className="w-6 h-6 text-neon-cyan" />
                  </div>
                  <h3 className="font-display font-semibold text-white text-lg mb-1 relative z-10">Cinematic AI</h3>
                  <p className="text-sm text-white/50 relative z-10">Generate high-quality cinematic scenes with AI directors.</p>
                </motion.div>
              </Link>

              <Link href="/agents">
                <motion.div
                  whileHover={{ scale: 1.02, y: -2 }}
                  className="glass-dark border border-white/10 rounded-3xl p-6 hover:border-neon-purple/30 hover:shadow-[0_0_20px_rgba(157,78,221,0.15)] transition-all h-full group relative overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-neon-purple/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="w-12 h-12 rounded-2xl bg-neon-purple/10 flex items-center justify-center mb-4 border border-neon-purple/20 relative z-10">
                    <Bot className="w-6 h-6 text-neon-purple" />
                  </div>
                  <h3 className="font-display font-semibold text-white text-lg mb-1 relative z-10">AI Agents</h3>
                  <p className="text-sm text-white/50 relative z-10">Automate research, scripting, and optimization tasks.</p>
                </motion.div>
              </Link>

              <Link href="/studio/canvas">
                <motion.div
                  whileHover={{ scale: 1.02, y: -2 }}
                  className="glass-dark border border-white/10 rounded-3xl p-6 hover:border-white/30 hover:shadow-[0_0_20px_rgba(255,255,255,0.1)] transition-all h-full group relative overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center mb-4 border border-white/20 relative z-10">
                    <Wand2 className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="font-display font-semibold text-white text-lg mb-1 relative z-10">Magic Canvas</h3>
                  <p className="text-sm text-white/50 relative z-10">Visual ideation and AI-powered workflows.</p>
                </motion.div>
              </Link>

              <Link href="/audio/voiceover">
                <motion.div
                  whileHover={{ scale: 1.02, y: -2 }}
                  className="glass-dark border border-white/10 rounded-3xl p-6 hover:border-blue-500/30 hover:shadow-[0_0_20px_rgba(59,130,246,0.15)] transition-all h-full group relative overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center mb-4 border border-blue-500/20 relative z-10">
                    <Mic className="w-6 h-6 text-blue-500" />
                  </div>
                  <h3 className="font-display font-semibold text-white text-lg mb-1 relative z-10">VoiceCraft</h3>
                  <p className="text-sm text-white/50 relative z-10">Generate ultra-realistic voiceovers from text.</p>
                </motion.div>
              </Link>

              <Link href="/image/cineshot">
                <motion.div
                  whileHover={{ scale: 1.02, y: -2 }}
                  className="glass-dark border border-white/10 rounded-3xl p-6 hover:border-amber-500/30 hover:shadow-[0_0_20px_rgba(245,158,11,0.15)] transition-all h-full group relative overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center mb-4 border border-amber-500/20 relative z-10">
                    <Camera className="w-6 h-6 text-amber-500" />
                  </div>
                  <h3 className="font-display font-semibold text-white text-lg mb-1 relative z-10">CineShot</h3>
                  <p className="text-sm text-white/50 relative z-10">Create cinematic photos with precise camera controls.</p>
                </motion.div>
              </Link>

              <Link href="/studio/trends">
                <motion.div
                  whileHover={{ scale: 1.02, y: -2 }}
                  className="glass-dark border border-white/10 rounded-3xl p-6 hover:border-rose-500/30 hover:shadow-[0_0_20px_rgba(244,63,94,0.15)] transition-all h-full group relative overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-rose-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="w-12 h-12 rounded-2xl bg-rose-500/10 flex items-center justify-center mb-4 border border-rose-500/20 relative z-10">
                    <TrendingUp className="w-6 h-6 text-rose-500" />
                  </div>
                  <h3 className="font-display font-semibold text-white text-lg mb-1 relative z-10">Viral Radar</h3>
                  <p className="text-sm text-white/50 relative z-10">Discover trending topics to boost your channel.</p>
                </motion.div>
              </Link>

              <Link href="/image/fashion">
                <motion.div
                  whileHover={{ scale: 1.02, y: -2 }}
                  className="glass-dark border border-white/10 rounded-3xl p-6 hover:border-emerald-500/30 hover:shadow-[0_0_20px_rgba(16,185,129,0.15)] transition-all h-full group relative overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-4 border border-emerald-500/20 relative z-10">
                    <Shirt className="w-6 h-6 text-emerald-500" />
                  </div>
                  <h3 className="font-display font-semibold text-white text-lg mb-1 relative z-10">StyleForge</h3>
                  <p className="text-sm text-white/50 relative z-10">Design and generate fashion sets with AI.</p>
                </motion.div>
              </Link>
            </div>

            {/* Analytics Chart */}
            <div className="h-[320px]">
              {loadingStats ? (
                <div className="w-full h-full flex flex-col items-center justify-center">
                   <div className="w-8 h-8 border-2 border-neon-lime/30 border-t-neon-lime rounded-full animate-spin mb-4" />
                   <p className="text-sm text-white/50">Fetching your channel analytics...</p>
                </div>
              ) : (
                <Suspense fallback={<LoadingSpinner />}>
                  <AnalyticsChart realStats={ytStats} recentVideos={ytVideos} />
                </Suspense>
              )}
            </div>

            {/* Recent Projects + Render Queue */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Recent Projects */}
              <div className="lg:col-span-2 glass border border-white/8 rounded-2xl overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/6">
                  <h3 className="font-display font-semibold text-white">Recent Projects</h3>
                  <Link href="/dashboard/videos">
                    <button className="text-xs text-neon-lime/70 hover:text-neon-lime transition-colors">
                      View all →
                    </button>
                  </Link>
                </div>
                <div className="divide-y divide-white/5">
                  {loadingVideos ? (
                    <div className="p-8 text-center text-white/40 text-sm">Loading your projects...</div>
                  ) : videos.length === 0 ? (
                    <div className="p-12 text-center">
                      <p className="text-white/40 text-sm mb-4">No projects yet. Start by uploading a video!</p>
                      <Link href="/dashboard/videos">
                        <Button variant="ghost" size="sm" className="border border-white/10">Upload Now</Button>
                      </Link>
                    </div>
                  ) : (
                    videos.slice(0, 5).map((video) => (
                      <div key={video.id} className="flex items-center gap-4 px-6 py-4 hover:bg-white/2 transition-colors">
                        <div className="w-14 h-10 bg-white/5 rounded-lg overflow-hidden border border-white/8 flex items-center justify-center shrink-0 relative">
                          {video.preview_url ? (
                            <Image src={video.preview_url} alt="" fill className="w-full h-full object-cover" />
                          ) : (
                            <Play className="w-4 h-4 text-white/20" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white truncate">{video.filename}</p>
                          <div className="flex items-center gap-3 mt-1">
                            <Badge variant="lime" size="sm" dot>uploaded</Badge>
                            <span className="text-xs text-white/30">{(video.size_bytes / (1024 * 1024)).toFixed(1)} MB</span>
                            {video.duration_seconds && (
                              <span className="text-xs text-white/30">{Math.floor(video.duration_seconds / 60)}:{(video.duration_seconds % 60).toString().padStart(2, '0')}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="flex items-center gap-1 text-xs text-white/30">
                            <Clock className="w-3 h-3" />
                            {new Date(video.created_at).toLocaleDateString()}
                          </div>
                          <button className="p-1.5 text-white/20 hover:text-white transition-colors rounded-lg hover:bg-white/5">
                            <MoreVertical className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Render Queue */}
              <Suspense fallback={<LoadingSpinner />}>
                <RenderQueue />
              </Suspense>
            </div>

            {/* Agent Activity */}
            <Suspense fallback={<LoadingSpinner />}>
              <AgentActivity />
            </Suspense>
          </div>
        </main>
      </div>

      <Modal
        isOpen={showConnectModal}
        onClose={() => !isConnecting && setShowConnectModal(false)}
        title="Connect YouTube Channel"
        description="Authorize YouTube Buddy to analyze your channel performance."
        size="sm"
      >
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mb-6 relative">
            <Youtube className="w-10 h-10 text-red-500 relative z-10" />
            {isConnecting && (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                className="absolute inset-0 rounded-full border-2 border-transparent border-t-red-500 border-r-red-500 opacity-50"
              />
            )}
          </div>
          
          {isConnected ? (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <h3 className="text-xl font-bold text-white mb-2">Connected Successfully!</h3>
              <p className="text-white/50 text-sm">Your analytics will begin syncing shortly.</p>
            </motion.div>
          ) : (
            <>
              <h3 className="text-xl font-bold text-white mb-2">Authorize Access</h3>
              <p className="text-white/50 text-sm mb-8 px-4">
                We need read-only access to your YouTube Analytics to track video performance and channel growth.
              </p>
              <Button 
                variant="primary" 
                className="w-full bg-red-500 hover:bg-red-600 text-white shadow-glow-red"
                onClick={handleConnect}
                disabled={isConnecting}
              >
                {isConnecting ? 'Authenticating with Google...' : 'Continue with Google'}
              </Button>
            </>
          )}
        </div>
      </Modal>
    </ProtectedRoute>
  );
}
