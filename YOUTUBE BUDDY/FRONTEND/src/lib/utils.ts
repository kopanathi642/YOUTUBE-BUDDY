import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { formatDistanceToNow, format } from 'date-fns';

// ── Tailwind utility merger ───────────────────────────────────────────────
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ── Formatting utilities ──────────────────────────────────────────────────
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatNumber(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

export function formatRelativeTime(date: Date | string): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true });
}

export function formatDate(date: Date | string, pattern = 'MMM d, yyyy'): string {
  return format(new Date(date), pattern);
}

// ── String utilities ──────────────────────────────────────────────────────
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength) + '...';
}

export function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ── Array utilities ───────────────────────────────────────────────────────
export function chunk<T>(array: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(array.length / size) }, (_, i) =>
    array.slice(i * size, i * size + size)
  );
}

// ── Error handling ────────────────────────────────────────────────────────
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'An unexpected error occurred';
}

// ── Async utilities ───────────────────────────────────────────────────────
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Validation utilities ──────────────────────────────────────────────────
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

// ── Color utilities ───────────────────────────────────────────────────────
export function getStatusColor(status: string): string {
  const map: Record<string, string> = {
    completed: 'text-neon-lime',
    processing: 'text-neon-cyan',
    pending: 'text-yellow-400',
    failed: 'text-red-400',
    queued: 'text-blue-400',
    cancelled: 'text-gray-400',
  };
  return map[status.toLowerCase()] || 'text-gray-400';
}

export function getStatusBg(status: string): string {
  const map: Record<string, string> = {
    completed: 'bg-neon-lime/10 border-neon-lime/30',
    processing: 'bg-neon-cyan/10 border-neon-cyan/30',
    pending: 'bg-yellow-400/10 border-yellow-400/30',
    failed: 'bg-red-400/10 border-red-400/30',
    queued: 'bg-blue-400/10 border-blue-400/30',
    cancelled: 'bg-gray-400/10 border-gray-400/30',
  };
  return map[status.toLowerCase()] || 'bg-gray-400/10 border-gray-400/30';
}
