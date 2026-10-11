'use client';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Sidebar } from '@/components/layout/Sidebar';
import { User, Mail, Camera, Youtube, Twitter, Shield, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/context/AuthContext';
import { logout } from '@/lib/firebase';
import Image from 'next/image';
import { useRouter } from 'next/navigation';

export default function ProfilePage() {
  const { user } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

  return (
    <ProtectedRoute>
      <div className="flex h-screen bg-bg-primary overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="sticky top-0 z-20 border-b border-white/6 bg-bg-primary/80 backdrop-blur-xl px-8 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center">
                <User className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="font-display text-xl font-bold text-white">Profile</h1>
                <p className="text-xs text-white/40">Manage your personal information and connections</p>
              </div>
            </div>
            <Button variant="primary" size="sm">Save Changes</Button>
          </div>

          <div className="px-8 py-8 max-w-4xl mx-auto space-y-8">
            
            {/* Profile Avatar Section */}
            <section className="glass border border-white/8 rounded-3xl p-8 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-r from-neon-purple/20 via-neon-cyan/20 to-neon-lime/20" />
              
              <div className="relative pt-16 flex items-end gap-6">
                <div className="relative group">
                  <div className="w-24 h-24 rounded-full border-4 border-bg-primary bg-bg-secondary flex items-center justify-center overflow-hidden relative z-10">
                    {user?.photoURL ? (
                      <Image src={user.photoURL} alt="Profile" fill className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-10 h-10 text-white/40" />
                    )}
                  </div>
                  <button className="absolute bottom-0 right-0 w-8 h-8 bg-neon-cyan text-black rounded-full flex items-center justify-center z-20 shadow-lg hover:scale-110 transition-transform">
                    <Camera className="w-4 h-4" />
                  </button>
                </div>
                
                <div className="flex-1 pb-2">
                  <h2 className="text-2xl font-display font-bold text-white mb-1">
                    {user?.displayName || 'Creator'}
                  </h2>
                  <p className="text-white/40 text-sm flex items-center gap-2">
                    <Mail className="w-4 h-4" /> {user?.email}
                  </p>
                </div>
              </div>
            </section>

            {/* General Info */}
            <section className="glass border border-white/8 rounded-3xl p-8">
              <h3 className="font-display font-semibold text-white mb-6">Personal Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm text-white/60">Display Name</label>
                  <input 
                    type="text" 
                    defaultValue={user?.displayName || ''}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-neon-cyan/50"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-white/60">Email Address</label>
                  <input 
                    type="email" 
                    defaultValue={user?.email || ''}
                    disabled
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white/50 cursor-not-allowed"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm text-white/60">Bio</label>
                  <textarea 
                    rows={3}
                    placeholder="Tell us about your channel..."
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-neon-cyan/50 resize-none"
                  />
                </div>
              </div>
            </section>

            {/* Connected Accounts */}
            <section className="glass border border-white/8 rounded-3xl p-8">
              <h3 className="font-display font-semibold text-white mb-6">Connected Accounts</h3>
              <div className="space-y-4">
                
                <div className="flex items-center justify-between p-4 rounded-xl border border-white/5 bg-white/2">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center">
                      <Youtube className="w-5 h-5 text-red-500" />
                    </div>
                    <div>
                      <p className="font-medium text-white">YouTube</p>
                      <p className="text-xs text-white/40">Not connected</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" className="border border-white/10 text-white/60">Connect</Button>
                </div>

                <div className="flex items-center justify-between p-4 rounded-xl border border-white/5 bg-white/2">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-[#1DA1F2]/10 flex items-center justify-center">
                      <Twitter className="w-5 h-5 text-[#1DA1F2]" />
                    </div>
                    <div>
                      <p className="font-medium text-white">X (Twitter)</p>
                      <p className="text-xs text-white/40">Not connected</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" className="border border-white/10 text-white/60">Connect</Button>
                </div>
                
              </div>
            </section>

            {/* Danger Zone */}
            <section className="border border-red-500/20 rounded-3xl p-8 bg-red-500/5">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-display font-semibold text-red-400 mb-1 flex items-center gap-2">
                    <Shield className="w-4 h-4" /> Danger Zone
                  </h3>
                  <p className="text-sm text-white/40">Permanently delete your account and all data.</p>
                </div>
                <Button variant="ghost" size="sm" className="text-red-400 border-red-500/20 hover:bg-red-500/10">Delete Account</Button>
              </div>
            </section>

            {/* Logout Button */}
            <div className="flex justify-center pt-8 pb-16">
              <Button onClick={handleLogout} variant="ghost" className="text-white/40 hover:text-white border border-white/10">
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </Button>
            </div>

          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
