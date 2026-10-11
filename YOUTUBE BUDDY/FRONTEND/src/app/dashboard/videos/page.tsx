'use client';
import { useEffect, useMemo, useState } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Sidebar } from '@/components/layout/Sidebar';
import { motion } from 'framer-motion';
import { Video, Search, Filter, Play, Download, MoreVertical, Clock, Share2, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { api } from '@/lib/api';
import { formatRelativeTime } from '@/lib/utils';
import toast from 'react-hot-toast';

type UploadRow = {
  id: number;
  filename: string;
  content_type: string;
  storage_path: string;
  duration_seconds?: number | null;
  created_at: string;
};

export default function MyVideosPage() {
  const [videos, setVideos] = useState<UploadRow[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const loadVideos = async () => {
    try {
      const response = await api.videos.list();
      setVideos(response.data || []);
    } catch {
      toast.error('Unable to load videos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVideos();
  }, []);

  const filteredVideos = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return videos;
    return videos.filter((video) => video.filename.toLowerCase().includes(q));
  }, [query, videos]);

  const deleteVideo = async (id: number) => {
    try {
      await api.videos.delete(String(id));
      setVideos((current) => current.filter((video) => video.id !== id));
    } catch {
      toast.error('Unable to delete video.');
    }
  };

  return (
    <ProtectedRoute>
      <div className="flex h-screen bg-bg-primary overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="sticky top-0 z-20 border-b border-white/6 bg-bg-primary/80 backdrop-blur-xl px-8 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center">
                <Video className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="font-display text-xl font-bold text-white">My Videos</h1>
                <p className="text-xs text-white/40">Manage uploaded and generated content</p>
              </div>
            </div>
            <Button variant="primary" size="sm">Create New Video</Button>
          </div>

          <div className="px-8 py-6 max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <Search className="w-4 h-4 text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search videos..."
                    className="bg-white/5 border border-white/10 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-neon-cyan/50 w-64"
                  />
                </div>
                <Button variant="ghost" size="sm" className="h-[38px] border border-white/10"><Filter className="w-4 h-4 mr-2" /> Filter</Button>
              </div>
              <div className="text-sm text-white/40">{filteredVideos.length} videos</div>
            </div>

            {loading ? (
              <div className="flex items-center gap-3 text-sm text-white/40">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading videos
              </div>
            ) : filteredVideos.length === 0 ? (
              <div className="rounded-2xl border border-white/8 bg-white/3 px-6 py-10 text-center text-sm text-white/35">
                No videos uploaded yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {filteredVideos.map((video, i) => (
                  <motion.div key={video.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                    className="glass border border-white/8 rounded-2xl overflow-hidden group hover:border-white/20 transition-all">
                    <div className="aspect-video bg-black/40 relative flex items-center justify-center overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-br from-neon-cyan/10 to-transparent opacity-30" />
                      <div className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm border border-white/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity scale-90 group-hover:scale-100 duration-200 cursor-pointer">
                        <Play className="w-4 h-4 text-white ml-1" />
                      </div>
                      <div className="absolute bottom-2 right-2 bg-black/60 backdrop-blur-md px-1.5 py-0.5 rounded text-[10px] font-mono text-white">
                        {video.duration_seconds ? `${video.duration_seconds}s` : 'uploaded'}
                      </div>
                    </div>

                    <div className="p-4">
                      <div className="flex items-start justify-between mb-1">
                        <h3 className="font-semibold text-white text-sm line-clamp-1 flex-1 pr-2">{video.filename}</h3>
                        <button className="text-white/30 hover:text-white transition-colors">
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="flex items-center gap-3 text-[11px] text-white/40 mb-4">
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {formatRelativeTime(video.created_at)}</span>
                      </div>

                      <div className="flex items-center justify-between pt-3 border-t border-white/5">
                        <Badge variant="lime" size="sm" dot>uploaded</Badge>
                        <div className="flex items-center gap-1">
                          <button className="p-1.5 rounded-lg text-white/40 hover:bg-white/5 hover:text-white transition-colors"><Share2 className="w-3.5 h-3.5" /></button>
                          <button className="p-1.5 rounded-lg text-white/40 hover:bg-white/5 hover:text-white transition-colors"><Download className="w-3.5 h-3.5" /></button>
                          <button onClick={() => deleteVideo(video.id)} className="p-1.5 rounded-lg text-white/40 hover:bg-red-500/10 hover:text-red-400 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
