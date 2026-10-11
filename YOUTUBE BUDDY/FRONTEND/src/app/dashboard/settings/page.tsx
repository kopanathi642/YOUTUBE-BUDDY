'use client';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Sidebar } from '@/components/layout/Sidebar';
import { Settings, Bell, Key, Globe, Moon, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function SettingsPage() {
  return (
    <ProtectedRoute>
      <div className="flex h-screen bg-bg-primary overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="sticky top-0 z-20 border-b border-white/6 bg-bg-primary/80 backdrop-blur-xl px-8 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center">
                <Settings className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="font-display text-xl font-bold text-white">Settings</h1>
                <p className="text-xs text-white/40">Manage your application preferences</p>
              </div>
            </div>
            <Button variant="primary" size="sm">Save Changes</Button>
          </div>

          <div className="px-8 py-8 max-w-4xl mx-auto space-y-8">
            
            {/* Preferences */}
            <section className="glass border border-white/8 rounded-3xl overflow-hidden">
              <div className="px-8 py-6 border-b border-white/6 flex items-center gap-3">
                <Monitor className="w-5 h-5 text-neon-cyan" />
                <h3 className="font-display font-semibold text-white">Appearance & Behavior</h3>
              </div>
              <div className="p-8 space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-white">Theme</p>
                    <p className="text-xs text-white/40">Select your preferred interface theme</p>
                  </div>
                  <div className="flex gap-2 bg-white/5 p-1 rounded-lg border border-white/10">
                    <button className="px-4 py-2 text-xs rounded-md font-medium transition-colors bg-white/10 text-white flex items-center gap-2">
                      <Moon className="w-3.5 h-3.5" /> Dark
                    </button>
                    <button className="px-4 py-2 text-xs rounded-md font-medium transition-colors text-white/40 hover:text-white flex items-center gap-2">
                      <Monitor className="w-3.5 h-3.5" /> System
                    </button>
                  </div>
                </div>
                
                <div className="h-px w-full bg-white/5" />
                
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-white">Language</p>
                    <p className="text-xs text-white/40">Choose your workspace language</p>
                  </div>
                  <div className="relative">
                    <Globe className="w-4 h-4 text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
                    <select className="bg-white/5 border border-white/10 rounded-lg pl-9 pr-8 py-2 text-sm text-white focus:outline-none focus:border-neon-cyan/50 appearance-none cursor-pointer">
                      <option className="bg-bg-primary">English (US)</option>
                      <option className="bg-bg-primary">Spanish</option>
                      <option className="bg-bg-primary">French</option>
                    </select>
                  </div>
                </div>
              </div>
            </section>

            {/* Notifications */}
            <section className="glass border border-white/8 rounded-3xl overflow-hidden">
              <div className="px-8 py-6 border-b border-white/6 flex items-center gap-3">
                <Bell className="w-5 h-5 text-neon-lime" />
                <h3 className="font-display font-semibold text-white">Notifications</h3>
              </div>
              <div className="p-8 space-y-6">
                <ToggleRow 
                  title="Generation Complete" 
                  description="Receive an email when your long renders finish processing." 
                  checked={true} 
                />
                <div className="h-px w-full bg-white/5" />
                <ToggleRow 
                  title="Marketing Updates" 
                  description="Receive emails about new AI models and feature releases." 
                  checked={false} 
                />
                <div className="h-px w-full bg-white/5" />
                <ToggleRow 
                  title="Browser Notifications" 
                  description="Show desktop alerts while the app is open in a background tab." 
                  checked={true} 
                />
              </div>
            </section>

            {/* API Keys */}
            <section className="glass border border-white/8 rounded-3xl overflow-hidden">
              <div className="px-8 py-6 border-b border-white/6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Key className="w-5 h-5 text-neon-purple" />
                  <h3 className="font-display font-semibold text-white">API Keys</h3>
                </div>
                <Button variant="ghost" size="sm" className="border border-white/10 text-white/60">Generate New Key</Button>
              </div>
              <div className="p-8">
                <p className="text-sm text-white/60 mb-6">Use these keys to authenticate API requests from your own custom applications.</p>
                
                <div className="bg-bg-primary/50 border border-white/10 rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-white mb-1">Production Key</p>
                    <p className="text-xs font-mono text-white/40">ytb_prod_**************************a9f2</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase font-bold text-neon-lime bg-neon-lime/10 px-2 py-1 rounded">Active</span>
                    <Button variant="ghost" size="sm" className="text-white/40 hover:text-white">Revoke</Button>
                  </div>
                </div>
              </div>
            </section>

          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}

function ToggleRow({ title, description, checked }: { title: string, description: string, checked: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <div className="pr-8">
        <p className="text-sm font-medium text-white mb-1">{title}</p>
        <p className="text-xs text-white/40 leading-relaxed">{description}</p>
      </div>
      <div className={`w-10 h-6 rounded-full flex items-center px-1 cursor-pointer transition-colors shrink-0 ${checked ? 'bg-neon-lime' : 'bg-white/10'}`}>
        <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
      </div>
    </div>
  );
}
