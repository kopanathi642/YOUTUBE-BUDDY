'use client';
import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import { Cloud, Upload, Film, CheckCircle, X } from 'lucide-react';
import { formatBytes } from '@/lib/utils';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

interface DropZoneProps {
  onUploadComplete: (videoId: string) => void;
}

export function DropZone({ onUploadComplete }: DropZoneProps) {
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles[0]) {
      setFile(acceptedFiles[0]);
      setUploaded(false);
      setProgress(0);
      setError(null);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'video/*': ['.mp4', '.mov', '.avi', '.mkv', '.webm'] },
    maxFiles: 1,
    maxSize: 5 * 1024 * 1024 * 1024, // 5GB
  });

  const rootProps = getRootProps();

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await api.videos.upload(formData, (p) => setProgress(p));
      const videoId = response.data.id;
      if (!videoId) {
        throw new Error('Upload completed but the backend did not return a video id.');
      }

      setUploaded(true);
      onUploadComplete(String(videoId));
      toast.success('Video uploaded! Processing transcription...');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Upload failed. Please try again.';
      toast.error(errorMessage);
      setError(errorMessage);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <AnimatePresence mode="wait">
        {!file ? (
          <motion.div
            key="dropzone"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div
              {...rootProps}
              className={`relative border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all duration-300 ${
                isDragActive
                  ? 'border-neon-lime bg-neon-lime/5 shadow-glow-lime'
                  : 'border-white/15 hover:border-neon-lime/40 hover:bg-white/2'
              }`}
            >
              <input {...getInputProps()} />
              <div className="flex flex-col items-center gap-4">
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all ${
                isDragActive ? 'bg-neon-lime/20' : 'bg-white/5'
              }`}>
                {isDragActive ? (
                  <Cloud className="w-8 h-8 text-neon-lime" />
                ) : (
                  <Upload className="w-8 h-8 text-white/30" />
                )}
              </div>
              <div>
                <p className="font-semibold text-white mb-1">
                  {isDragActive ? 'Drop your video here' : 'Drag & drop your video'}
                </p>
                <p className="text-sm text-white/40">
                  or <span className="text-neon-lime">browse files</span>
                </p>
              </div>
              <div className="flex gap-4 text-xs text-white/25">
                <span>MP4 • MOV • AVI • MKV</span>
                <span>•</span>
                <span>Up to 5GB</span>
              </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="preview"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="glass border border-white/10 rounded-2xl p-5"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-neon-lime/10 rounded-xl flex items-center justify-center shrink-0">
                <Film className="w-6 h-6 text-neon-lime" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{file.name}</p>
                <p className="text-xs text-white/40 mt-0.5">{formatBytes(file.size)}</p>
              </div>
              {uploaded ? (
                <CheckCircle className="w-5 h-5 text-neon-lime shrink-0" />
              ) : (
                <button
                  onClick={() => setFile(null)}
                  className="p-1.5 text-white/30 hover:text-white transition-colors rounded-lg hover:bg-white/5"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {(uploading || uploaded) && (
              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-white/40">
                    {uploaded ? 'Upload complete' : 'Uploading...'}
                  </span>
                  <span className="text-xs font-mono text-neon-lime">{progress}%</span>
                </div>
                <div className="h-1.5 bg-white/8 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-neon-lime to-neon-cyan rounded-full"
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              </div>
            )}

            {!uploading && !uploaded && (
              <button
                onClick={handleUpload}
                className="w-full mt-4 py-2.5 bg-neon-lime text-black text-sm font-semibold rounded-xl hover:bg-lime-300 transition-colors"
              >
                Upload & Process
              </button>
            )}
            {error && (
              <p className="mt-3 text-xs text-red-300">
                {error}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
