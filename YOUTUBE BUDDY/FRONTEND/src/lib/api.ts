import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { auth } from './firebase';

// ── API Client Configuration ──────────────────────────────────────────────
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const API_VERSION = process.env.NEXT_PUBLIC_API_VERSION || 'v1';

const apiClient: AxiosInstance = axios.create({
  baseURL: `${API_URL}/api/${API_VERSION}`,
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ── Request Interceptor — Attach Firebase auth token ──────────────────────
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const user = auth.currentUser;
    if (user) {
      const token = await user.getIdToken();
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ── Response Interceptor — Error handling & token refresh ────────────────
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      const user = auth.currentUser;
      if (user) {
        const token = await user.getIdToken();
        originalRequest.headers.Authorization = `Bearer ${token}`;
        return apiClient(originalRequest);
      }
    }
    return Promise.reject(error);
  }
);

// ── Upload client with progress tracking ─────────────────────────────────
export const createUploadClient = (
  onUploadProgress: (progress: number) => void
): AxiosInstance => {
  const uploadClient = axios.create({
    baseURL: `${API_URL}/api/${API_VERSION}`,
    timeout: 300000, // 5 min for large uploads
    onUploadProgress: (progressEvent) => {
      if (progressEvent.total) {
        const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        onUploadProgress(percent);
      }
    },
  });

  uploadClient.interceptors.request.use(async (config) => {
    const user = auth.currentUser;
    if (user) {
      const token = await user.getIdToken();
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  return uploadClient;
};

// ── API Endpoints ─────────────────────────────────────────────────────────
export const api = {
  // Videos
  videos: {
    upload: (formData: FormData, onProgress: (p: number) => void) =>
      createUploadClient(onProgress).post('/videos/upload', formData),
    list: (params?: Record<string, unknown>) =>
      apiClient.get('/videos', { params }),
    get: (id: string) => apiClient.get(`/videos/${id}`),
    delete: (id: string) => apiClient.delete(`/videos/${id}`),
    status: (id: string) => apiClient.get(`/videos/${id}/status`),
  },

  // Transcription
  transcription: {
    get: (videoId: string) => apiClient.get(`/transcription/${videoId}`),
    create: (videoId: string) => apiClient.post(`/transcription/${videoId}/create`),
  },

  // Shorts Generation
  shorts: {
    generate: (videoId: string, params: Record<string, unknown>) =>
      apiClient.post(`/shorts/generate`, { videoId, ...params }),
    list: (videoId: string) => apiClient.get(`/shorts`, { params: { videoId } }),
    get: (id: string) => apiClient.get(`/shorts/${id}`),
    export: (id: string, format: string) =>
      apiClient.post(`/shorts/${id}/export`, { format }),
  },

  // Viral Moments
  viralMoments: {
    detect: (videoId: string) => apiClient.post(`/viral-moments/detect`, { videoId }),
    list: (videoId: string) => apiClient.get(`/viral-moments`, { params: { videoId } }),
  },

  // AI Cinematic Studio
  cinematic: {
    generate: (params: Record<string, unknown>) =>
      apiClient.post(`/cinematic/generate`, params),
    history: () => apiClient.get(`/cinematic/history`),
    get: (id: string) => apiClient.get(`/cinematic/${id}`),
  },

  // AI Studio
  studio: {
    generate: (params: Record<string, unknown>) =>
      apiClient.post(`/studio/generate`, params),
  },

  // AI Agents
  agents: {
    list: () => apiClient.get(`/agents`),
    history: () => apiClient.get(`/agents/history`),
    trigger: (agentId: string, params: Record<string, unknown>) =>
      apiClient.post(`/agents/${agentId}/trigger`, params),
    status: (jobId: string) => apiClient.get(`/agents/jobs/${jobId}`),
    logs: (agentId: string) => apiClient.get(`/agents/${agentId}/logs`),
  },

  // Analytics
  analytics: {
    overview: () => apiClient.get(`/analytics/overview`),
    channelStats: () => apiClient.get(`/analytics/channel`),
    videoStats: (videoId: string) => apiClient.get(`/analytics/videos/${videoId}`),
  },

  // Render Queue
  renderQueue: {
    list: () => apiClient.get(`/render-queue`),
    cancel: (jobId: string) => apiClient.delete(`/render-queue/${jobId}`),
    retry: (jobId: string) => apiClient.post(`/render-queue/${jobId}/retry`),
  },

  // User / Profile
  user: {
    profile: () => apiClient.get(`/user/profile`),
    update: (data: Record<string, unknown>) => apiClient.put(`/user/profile`, data),
    apiKeys: () => apiClient.get(`/user/api-keys`),
    createApiKey: (name: string) => apiClient.post(`/user/api-keys`, { name }),
    revokeApiKey: (keyId: string) => apiClient.delete(`/user/api-keys/${keyId}`),
    subscription: () => apiClient.get(`/user/subscription`),
  },
};

export default apiClient;
