import { getYouTubeToken, isYouTubeTokenValid } from './firebase';

// ── Types ───────────────────────────────────────────────────────────────────

export interface YouTubeChannelStats {
  title: string;
  thumbnail: string;
  viewCount: number;
  subscriberCount: number;
  videoCount: number;
}

export interface YouTubeVideoStats {
  id: string;
  title: string;
  thumbnail: string;
  publishedAt: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

/**
 * Make an authenticated request to YouTube Data API v3.
 * Returns null and clears token on 401/403.
 */
const youtubeApiFetch = async <T>(
  endpoint: string,
  params: Record<string, string> = {}
): Promise<T | null> => {
  const token = getYouTubeToken();
  if (!token) return null;

  const url = new URL(`${YOUTUBE_API_BASE}/${endpoint}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  try {
    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error(`YouTube API ${endpoint} error:`, {
        status: response.status,
        statusText: response.statusText,
        errorData,
      });

      if (response.status === 401 || response.status === 403) {
        // Token expired or invalid scopes — clear it
        if (typeof window !== 'undefined') {
          localStorage.removeItem('ytb_youtube_token');
          localStorage.removeItem('ytb_youtube_token_expiry');
        }
      }
      return null;
    }

    return (await response.json()) as T;
  } catch (error) {
    console.error(`YouTube API ${endpoint} fetch error:`, error);
    return null;
  }
};

// ── Channel Stats (live) ────────────────────────────────────────────────────

type YouTubeChannelResponse = {
  items?: Array<{
    snippet?: {
      title?: string;
      thumbnails?: { default?: { url?: string } };
    };
    statistics?: {
      viewCount?: string;
      subscriberCount?: string;
      videoCount?: string;
    };
  }>;
};

export const fetchYouTubeChannelStats = async (): Promise<YouTubeChannelStats | null> => {
  if (typeof window === 'undefined') return null;
  if (!isYouTubeTokenValid()) return null;

  const data = await youtubeApiFetch<YouTubeChannelResponse>('channels', {
    part: 'snippet,statistics',
    mine: 'true',
  });

  if (!data?.items?.length) return null;

  const channel = data.items[0];
  return {
    title: channel.snippet?.title || 'Your Channel',
    thumbnail: channel.snippet?.thumbnails?.default?.url || '',
    viewCount: parseInt(channel.statistics?.viewCount || '0', 10),
    subscriberCount: parseInt(channel.statistics?.subscriberCount || '0', 10),
    videoCount: parseInt(channel.statistics?.videoCount || '0', 10),
  };
};

// ── Per-Video Stats (live) ──────────────────────────────────────────────────

type YouTubeSearchResponse = {
  items?: Array<{
    id?: { videoId?: string };
  }>;
};

type YouTubeVideosResponse = {
  items?: Array<{
    id: string;
    snippet?: {
      title?: string;
      publishedAt?: string;
      thumbnails?: { medium?: { url?: string } };
    };
    statistics?: {
      viewCount?: string;
      likeCount?: string;
      commentCount?: string;
    };
  }>;
};

/**
 * Fetch the user's most recent YouTube videos with their view/like/comment stats.
 * This is LIVE data from YouTube Data API v3 — no fake data.
 *
 * @param maxResults Number of recent videos to fetch (default: 10, max: 50)
 */
export const fetchYouTubeRecentVideos = async (
  maxResults: number = 10
): Promise<YouTubeVideoStats[]> => {
  if (typeof window === 'undefined') return [];
  if (!isYouTubeTokenValid()) return [];

  // Step 1: Get the user's uploaded video IDs
  const searchData = await youtubeApiFetch<YouTubeSearchResponse>('search', {
    part: 'id',
    forMine: 'true',
    type: 'video',
    order: 'date',
    maxResults: String(Math.min(maxResults, 50)),
  });

  if (!searchData?.items?.length) return [];

  const videoIds = searchData.items
    .map((item) => item.id?.videoId)
    .filter(Boolean)
    .join(',');

  if (!videoIds) return [];

  // Step 2: Get detailed stats for those videos
  const videosData = await youtubeApiFetch<YouTubeVideosResponse>('videos', {
    part: 'snippet,statistics',
    id: videoIds,
  });

  if (!videosData?.items?.length) return [];

  return videosData.items.map((video) => ({
    id: video.id,
    title: video.snippet?.title || 'Untitled',
    thumbnail: video.snippet?.thumbnails?.medium?.url || '',
    publishedAt: video.snippet?.publishedAt || '',
    viewCount: parseInt(video.statistics?.viewCount || '0', 10),
    likeCount: parseInt(video.statistics?.likeCount || '0', 10),
    commentCount: parseInt(video.statistics?.commentCount || '0', 10),
  }));
};
