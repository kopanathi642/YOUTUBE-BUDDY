'use client';
import { useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Sidebar } from '@/components/layout/Sidebar';
import { motion } from 'framer-motion';
import { BarChart3, Users, Eye, Clock, Scissors, Loader2 } from 'lucide-react';
import { AnalyticsChart } from '@/components/dashboard/AnalyticsChart';
import { fetchYouTubeChannelStats, YouTubeChannelStats } from '@/lib/youtube';
import { api } from '@/lib/api';
import { formatNumber, formatRelativeTime } from '@/lib/utils';

type OverviewStats = {
  totalVideos: number;
  totalShorts: number;
  activeJobs: number;
  storageUsed: number;
};

type UploadRow = {
  id: number;
  filename: string;
  content_type: string;
  size_bytes: number;
  created_at: string;
};

export default function AnalyticsPage() {
  const [stats, setStats] = useState<YouTubeChannelStats | null>(null);
  const [overview, setOverview] = useState<OverviewStats | null>(null);
  const [videos, setVideos] = useState<UploadRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      const [youtubeResult, overviewResult, videosResult] = await Promise.allSettled([
        fetchYouTubeChannelStats(),
        api.analytics.overview(),
        api.videos.list(),
      ]);

      if (youtubeResult.status === 'fulfilled') setStats(youtubeResult.value);
      if (overviewResult.status === 'fulfilled') setOverview(overviewResult.value.data);
      if (videosResult.status === 'fulfilled') setVideos(videosResult.value.data || []);
      setLoading(false);
    }
    loadStats();
  }, []);

  const topStats = [
    {
      label: 'Total Views',
      value: stats ? formatNumber(stats.viewCount) : '0',
      source: stats ? 'YouTube live' : 'Connect YouTube',
      icon: Eye,
      color: 'text-neon-lime',
      bg: 'bg-neon-lime/10',
    },
    {
      label: 'Subscribers',
      value: stats ? formatNumber(stats.subscriberCount) : '0',
      source: stats ? 'YouTube live' : 'Connect YouTube',
      icon: Users,
      color: 'text-neon-cyan',
      bg: 'bg-neon-cyan/10',
    },
    {
      label: 'Uploaded Videos',
      value: formatNumber(overview?.totalVideos ?? videos.length),
      source: 'Backend database',
      icon: Clock,
      color: 'text-white',
      bg: 'bg-white/10',
    },
    {
      label: 'Generated Shorts',
      value: formatNumber(overview?.totalShorts ?? 0),
      source: 'Backend database',
      icon: Scissors,
      color: 'text-neon-purple',
      bg: 'bg-neon-purple/10',
    },
  ];

  return (
    <ProtectedRoute>
      <div className="flex h-screen bg-bg-primary overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="sticky top-0 z-20 border-b border-white/6 bg-bg-primary/80 backdrop-blur-xl px-8 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="font-display text-xl font-bold text-white">
                  {stats ? `${stats.title} Analytics` : 'Analytics'}
                </h1>
                <p className="text-xs text-white/40">Live YouTube data plus local backend activity</p>
              </div>
            </div>
          </div>

          <div className="px-8 py-6 max-w-7xl mx-auto space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {topStats.map((stat, i) => (
                <motion.div key={stat.label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                  className="glass border border-white/8 rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${stat.bg}`}>
                      <stat.icon className={`w-5 h-5 ${stat.color}`} />
                    </div>
                    <span className="text-[10px] uppercase tracking-wider text-white/30">{stat.source}</span>
                  </div>
                  <h3 className="font-display text-3xl font-bold text-white mb-1">{loading ? '...' : stat.value}</h3>
                  <p className="text-sm text-white/40">{stat.label}</p>
                </motion.div>
              ))}
            </div>

            <div className="glass border border-white/8 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-display font-semibold text-white">Current Channel Snapshot</h3>
              </div>
              <div className="h-[400px]">
                {loading ? (
                  <div className="w-full h-full flex items-center justify-center">
                    <Loader2 className="w-8 h-8 text-neon-lime animate-spin" />
                  </div>
                ) : (
                  <AnalyticsChart realStats={stats} />
                )}
              </div>
            </div>

            <div className="glass border border-white/8 rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-white/6 flex justify-between items-center">
                <h3 className="font-display font-semibold text-white">Uploaded Content</h3>
                <span className="text-xs text-white/35">{videos.length} videos</span>
              </div>
              <div className="divide-y divide-white/5">
                {loading ? (
                  <div className="px-6 py-8 flex items-center gap-3 text-sm text-white/40">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading videos
                  </div>
                ) : videos.length === 0 ? (
                  <div className="px-6 py-8 text-sm text-white/35">No uploaded videos yet.</div>
                ) : videos.slice(0, 8).map((video, i) => (
                  <div key={video.id} className="flex items-center justify-between px-6 py-4 hover:bg-white/2 transition-colors">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="font-mono text-white/20 font-bold text-lg w-4">{i + 1}</div>
                      <div className="w-20 h-12 bg-black/40 rounded-lg border border-white/10 flex items-center justify-center">
                        <BarChart3 className="w-5 h-5 text-white/20" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white mb-1 truncate">{video.filename}</p>
                        <p className="text-xs text-white/40">{formatRelativeTime(video.created_at)}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-white">{(video.size_bytes / (1024 * 1024)).toFixed(1)} MB</p>
                      <p className="text-xs text-white/40">{video.content_type}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
