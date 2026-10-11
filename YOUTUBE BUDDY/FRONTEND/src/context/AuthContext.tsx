'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { LocalUser, onAuthChange } from '@/lib/firebase';
import { UserProfile } from '@/types';

type AuthUser = LocalUser;

interface AuthContextValue {
  user: AuthUser | null;
  profile: UserProfile | null;
  loading: boolean;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  profile: null,
  loading: true,
  isAuthenticated: false,
});

type BackendUserProfile = Partial<UserProfile> & {
  display_name?: string | null;
  picture?: string | null;
  channel_name?: string | null;
  channel_url?: string | null;
  created_at?: string;
  updated_at?: string;
  total_videos?: number;
  total_shorts?: number;
  storage_used?: number;
  storage_limit?: number;
};

const normalizeProfile = (profile: BackendUserProfile): UserProfile => ({
  uid: profile.uid || '',
  email: profile.email || null,
  displayName: profile.displayName ?? profile.display_name ?? null,
  photoURL: profile.photoURL ?? profile.picture ?? null,
  plan: profile.plan || 'free',
  createdAt: profile.createdAt || profile.created_at || '',
  updatedAt: profile.updatedAt || profile.updated_at || '',
  channelName: profile.channelName ?? profile.channel_name ?? undefined,
  channelUrl: profile.channelUrl ?? profile.channel_url ?? undefined,
  totalVideos: profile.totalVideos ?? profile.total_videos,
  totalShorts: profile.totalShorts ?? profile.total_shorts,
  storageUsed: profile.storageUsed ?? profile.storage_used,
  storageLimit: profile.storageLimit ?? profile.storage_limit,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoaded, setProfileLoaded] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthChange(async (currentUser) => {
      setUser(currentUser);

      if (currentUser && !profileLoaded) {
        try {
          const { api } = await import('@/lib/api');
          const response = await api.user.profile();
          setProfile(normalizeProfile(response.data));
          setProfileLoaded(true);
        } catch (error) {
          console.warn('Failed to load user profile:', error);
          setProfile(null);
        }
      } else if (!currentUser) {
        setProfile(null);
        setProfileLoaded(false);
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, [profileLoaded]);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
