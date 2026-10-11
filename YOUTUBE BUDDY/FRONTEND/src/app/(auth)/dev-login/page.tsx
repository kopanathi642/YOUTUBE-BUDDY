'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { signInWithDemo } from '@/lib/firebase';

export default function DevLoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleDevLogin = async () => {
    setLoading(true);
    try {
      await signInWithDemo();

      toast.success('Dev login successful!');
      router.push('/dashboard');
    } catch (error) {
      console.error('Dev login error:', error);
      toast.error('Dev login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center">
      <div className="text-center max-w-md w-full px-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Dev Login</h1>
          <p className="text-white/50 text-sm">Quick test login for development</p>
        </div>

        <div className="space-y-4 bg-white/5 border border-white/10 rounded-xl p-6 mb-6">
          <div className="text-left space-y-2">
            <p className="text-xs text-white/60 uppercase tracking-wider font-semibold">Test Credentials</p>
            <p className="text-sm text-white/80 font-mono bg-black/20 p-3 rounded-lg">demo@youtubebuddy.com</p>
            <p className="text-sm text-white/80 font-mono bg-black/20 p-3 rounded-lg">Demo@12345</p>
          </div>
        </div>

        <button
          onClick={handleDevLogin}
          disabled={loading}
          className="w-full bg-neon-lime text-black font-semibold py-3 rounded-lg hover:bg-neon-lime/90 transition-colors disabled:opacity-50"
        >
          {loading ? 'Logging in...' : 'Login as Dev User'}
        </button>

        <p className="text-xs text-white/40 mt-6 text-center">
          This endpoint only works in development mode
        </p>
      </div>
    </div>
  );
}
