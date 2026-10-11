// ── Auth Types ─────────────────────────────────────────────────────────────
export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  plan: 'free' | 'creator' | 'pro' | 'enterprise';
  createdAt: string;
  updatedAt: string;
  channelName?: string;
  channelUrl?: string;
  totalVideos?: number;
  totalShorts?: number;
  storageUsed?: number;
  storageLimit?: number;
}

// ── Video Types ────────────────────────────────────────────────────────────
export type VideoStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'queued';

export interface Video {
  id: string;
  title: string;
  description?: string;
  filename: string;
  fileSize: number;
  duration: number;
  resolution: string;
  thumbnail?: string;
  status: VideoStatus;
  uploadedAt: string;
  processedAt?: string;
  userId: string;
}

// ── Transcript Types ───────────────────────────────────────────────────────
export interface TranscriptSegment {
  id: string;
  start: number;
  end: number;
  text: string;
  confidence: number;
  speaker?: string;
}

export interface Transcript {
  videoId: string;
  segments: TranscriptSegment[];
  fullText: string;
  language: string;
  duration: number;
  createdAt: string;
}

// ── Viral Moment Types ─────────────────────────────────────────────────────
export interface ViralMoment {
  id: string;
  videoId: string;
  start: number;
  end: number;
  score: number;
  reason: string;
  preview?: string;
  tags: string[];
}

// ── Shorts Types ───────────────────────────────────────────────────────────
export type AspectRatio = '16:9' | '9:16' | '1:1' | '4:5';

export interface Short {
  id: string;
  videoId: string;
  title: string;
  start: number;
  end: number;
  duration: number;
  aspectRatio: AspectRatio;
  status: VideoStatus;
  thumbnail?: string;
  url?: string;
  captions?: boolean;
  createdAt: string;
}

// ── Cinematic Studio Types ─────────────────────────────────────────────────
export type CameraMovement =
  | 'static'
  | 'pan-left'
  | 'pan-right'
  | 'tilt-up'
  | 'tilt-down'
  | 'dolly-in'
  | 'dolly-out'
  | 'orbit'
  | 'crane-up'
  | 'crane-down';

export interface CinematicScene {
  id: string;
  prompt: string;
  cameraMovement: CameraMovement;
  duration: number;
  style: string;
  status: VideoStatus;
  thumbnail?: string;
  url?: string;
  createdAt: string;
}

// ── AI Agent Types ─────────────────────────────────────────────────────────
export type AgentType = 'trend' | 'script' | 'seo' | 'shorts' | 'upload' | 'thumbnail';
export type AgentStatus = 'idle' | 'running' | 'completed' | 'failed' | 'paused';

export interface AgentJob {
  id: string;
  agentType: AgentType;
  status: AgentStatus;
  progress: number;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  logs: AgentLog[];
  createdAt: string;
  updatedAt: string;
}

export interface AgentLog {
  timestamp: string;
  level: 'info' | 'warning' | 'error' | 'success';
  message: string;
}

// ── Render Queue Types ─────────────────────────────────────────────────────
export interface RenderJob {
  id: string;
  title: string;
  type: 'short' | 'cinematic' | 'export';
  status: VideoStatus;
  progress: number;
  videoId?: string;
  shortId?: string;
  createdAt: string;
  estimatedCompletion?: string;
  error?: string;
}

// ── Analytics Types ────────────────────────────────────────────────────────
export interface AnalyticsDataPoint {
  date: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  revenue?: number;
}

export interface ChannelStats {
  totalViews: number;
  totalSubscribers: number;
  totalVideos: number;
  totalShorts: number;
  avgViewsPerVideo: number;
  subscriberGrowthRate: number;
  revenueThisMonth?: number;
}

// ── Pricing Types ─────────────────────────────────────────────────────────
export interface PricingPlan {
  id: 'free' | 'creator' | 'pro' | 'enterprise';
  name: string;
  price: { monthly: number; annual: number };
  description: string;
  features: string[];
  limits: {
    videos: number | 'unlimited';
    shorts: number | 'unlimited';
    storage: number | 'unlimited';
    agents: number | 'unlimited';
  };
  popular?: boolean;
  enterprise?: boolean;
}

// ── API Response Types ─────────────────────────────────────────────────────
export interface ApiResponse<T> {
  data: T;
  message?: string;
  status: 'success' | 'error';
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// ── Form Types ─────────────────────────────────────────────────────────────
export interface LoginFormData {
  email: string;
  password: string;
}

export interface SignupFormData {
  email: string;
  password: string;
  confirmPassword: string;
  displayName: string;
}

export interface ForgotPasswordFormData {
  email: string;
}

// ── UI Types ───────────────────────────────────────────────────────────────
export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface NavItem {
  label: string;
  href: string;
  icon?: string;
  badge?: string;
  children?: NavItem[];
}

export interface SidebarItem {
  label: string;
  href: string;
  icon: string;
  badge?: number;
}
