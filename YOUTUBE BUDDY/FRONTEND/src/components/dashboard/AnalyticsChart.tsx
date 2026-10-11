'use client';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { YouTubeChannelStats, YouTubeVideoStats } from '@/lib/youtube';
import { useMemo, useState } from 'react';

const CustomTooltip = ({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ value: number; color: string; name: string }>;
  label?: string;
}) => {
  if (active && payload && payload.length) {
    return (
      <div className="glass-dark rounded-xl border border-white/10 p-3 shadow-xl text-xs">
        <p className="text-white/60 mb-2 font-medium truncate max-w-[200px]">{label}</p>
        {payload.map((p) => (
          <div key={p.name} className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
            <span className="text-white/70 capitalize">{p.name}:</span>
            <span className="text-white font-semibold">{p.value.toLocaleString()}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

type ChartMode = 'overview' | 'videos';

interface AnalyticsChartProps {
  realStats?: YouTubeChannelStats | null;
  recentVideos?: YouTubeVideoStats[];
}

export function AnalyticsChart({ realStats, recentVideos = [] }: AnalyticsChartProps) {
  const [mode, setMode] = useState<ChartMode>(recentVideos.length > 0 ? 'videos' : 'overview');

  const overviewData = useMemo(() => {
    if (!realStats) return [];
    return [{
      date: 'Current',
      views: realStats.viewCount || 0,
      subscribers: realStats.subscriberCount || 0,
      videos: realStats.videoCount || 0,
    }];
  }, [realStats]);

  const videoData = useMemo(() => {
    if (!recentVideos.length) return [];
    return recentVideos.map((video) => ({
      title: video.title.length > 25 ? video.title.slice(0, 25) + '…' : video.title,
      views: video.viewCount,
      likes: video.likeCount,
      comments: video.commentCount,
    }));
  }, [recentVideos]);

  const hasData = overviewData.length > 0 || videoData.length > 0;

  if (!hasData) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-sm text-white/35">
        <p>Connect YouTube to load live channel analytics.</p>
        <p className="text-[10px] mt-1 text-white/20">Real-time data from YouTube Data API v3</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      <div className="flex items-center justify-between mb-4">
        {/* Mode Toggle */}
        {videoData.length > 0 && (
          <div className="flex gap-1 p-0.5 rounded-lg bg-white/5 border border-white/8">
            <button
              onClick={() => setMode('overview')}
              className={`px-3 py-1 text-[11px] rounded-md transition-all ${
                mode === 'overview'
                  ? 'bg-white/10 text-white font-medium'
                  : 'text-white/40 hover:text-white/60'
              }`}
            >
              Channel Overview
            </button>
            <button
              onClick={() => setMode('videos')}
              className={`px-3 py-1 text-[11px] rounded-md transition-all ${
                mode === 'videos'
                  ? 'bg-white/10 text-white font-medium'
                  : 'text-white/40 hover:text-white/60'
              }`}
            >
              Per Video
            </button>
          </div>
        )}

        {/* Legend */}
        <div className="flex items-center gap-4">
          {mode === 'overview'
            ? [
                { color: '#a3e635', label: 'Views' },
                { color: '#22d3ee', label: 'Subscribers' },
                { color: '#a855f7', label: 'Videos' },
              ].map((l) => (
                <div key={l.label} className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: l.color }} />
                  <span className="text-xs text-white/50">{l.label}</span>
                </div>
              ))
            : [
                { color: '#a3e635', label: 'Views' },
                { color: '#22d3ee', label: 'Likes' },
                { color: '#a855f7', label: 'Comments' },
              ].map((l) => (
                <div key={l.label} className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: l.color }} />
                  <span className="text-xs text-white/50">{l.label}</span>
                </div>
              ))}
        </div>
      </div>

      {mode === 'overview' && overviewData.length > 0 && (
        <ResponsiveContainer width="100%" height={270}>
          <AreaChart data={overviewData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
            <defs>
              {[
                { id: 'lime', color: '#a3e635' },
                { id: 'cyan', color: '#22d3ee' },
                { id: 'purple', color: '#a855f7' },
              ].map((g) => (
                <linearGradient key={g.id} id={`gradient-${g.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={g.color} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={g.color} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis
              dataKey="date"
              tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}K` : v)}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area type="monotone" dataKey="views" stroke="#a3e635" strokeWidth={2} fill="url(#gradient-lime)" />
            <Area type="monotone" dataKey="subscribers" stroke="#22d3ee" strokeWidth={2} fill="url(#gradient-cyan)" />
            <Area type="monotone" dataKey="videos" stroke="#a855f7" strokeWidth={2} fill="url(#gradient-purple)" />
          </AreaChart>
        </ResponsiveContainer>
      )}

      {mode === 'videos' && videoData.length > 0 && (
        <ResponsiveContainer width="100%" height={270}>
          <BarChart data={videoData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis
              dataKey="title"
              tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 9 }}
              axisLine={false}
              tickLine={false}
              interval={0}
              angle={-15}
              textAnchor="end"
              height={60}
            />
            <YAxis
              tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}K` : String(v))}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="views" fill="#a3e635" radius={[4, 4, 0, 0]} />
            <Bar dataKey="likes" fill="#22d3ee" radius={[4, 4, 0, 0]} />
            <Bar dataKey="comments" fill="#a855f7" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}

      {/* Fallback: overview mode but no channel data yet */}
      {mode === 'overview' && overviewData.length === 0 && (
        <div className="w-full h-[270px] flex items-center justify-center text-sm text-white/35">
          Channel overview data not available yet.
        </div>
      )}
    </div>
  );
}
