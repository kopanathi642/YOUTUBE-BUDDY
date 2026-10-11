'use client';
import { useState, useCallback, useRef } from 'react';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

interface UseVideoUploadReturn {
  uploadFile: (file: File) => Promise<string | null>;
  progress: number;
  uploading: boolean;
  error: string | null;
  reset: () => void;
}

export function useVideoUpload(): UseVideoUploadReturn {
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const simulationRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const reset = useCallback(() => {
    setProgress(0);
    setUploading(false);
    setError(null);
    if (simulationRef.current) clearInterval(simulationRef.current);
  }, []);

  const uploadFile = useCallback(async (file: File): Promise<string | null> => {
    setUploading(true);
    setError(null);
    setProgress(0);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('filename', file.name);
      formData.append('size', file.size.toString());

      const response = await api.videos.upload(formData, setProgress);
      setUploading(false);
      toast.success('Upload complete! Transcription processing...');
      return response.data.id ? String(response.data.id) : null;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Upload failed. Please try again.';
      setError(errorMessage);
      setUploading(false);
      toast.error(errorMessage);
      return null;
    }
  }, []);

  return { uploadFile, progress, uploading, error, reset };
}
