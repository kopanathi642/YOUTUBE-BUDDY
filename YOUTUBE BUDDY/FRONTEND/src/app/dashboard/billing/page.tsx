'use client';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Sidebar } from '@/components/layout/Sidebar';
import { CreditCard, CheckCircle2, Download, Clock } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function BillingPage() {
  return (
    <ProtectedRoute>
      <div className="flex h-screen bg-bg-primary overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="sticky top-0 z-20 border-b border-white/6 bg-bg-primary/80 backdrop-blur-xl px-8 py-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-display text-xl font-bold text-white">Billing & Usage</h1>
              <p className="text-xs text-white/40">Manage your subscription and generation credits</p>
            </div>
          </div>

          <div className="px-8 py-8 max-w-5xl mx-auto space-y-8">
            
            {/* Current Plan Overview */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              <div className="lg:col-span-2 glass border border-white/8 rounded-3xl p-8 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-neon-purple/10 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/4" />
                
                <div className="relative z-10 flex items-start justify-between mb-8">
                  <div>
                    <h2 className="text-sm text-white/40 font-medium uppercase tracking-wider mb-1">Current Plan</h2>
                    <h3 className="text-3xl font-display font-bold text-white flex items-center gap-2">
                      Pro Creator <Badge>Active</Badge>
                    </h3>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-white">$29<span className="text-sm text-white/40 font-normal">/mo</span></p>
                    <p className="text-xs text-white/40 mt-1">Renews on Oct 14, 2026</p>
                  </div>
                </div>

                <div className="relative z-10">
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="text-white/60">Generation Credits (Monthly)</span>
                    <span className="text-white font-medium">840 / 1,000</span>
                  </div>
                  <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-neon-purple to-neon-cyan w-[84%] rounded-full" />
                  </div>
                  <p className="text-xs text-white/40 mt-2">Resets in 12 days</p>
                </div>

                <div className="mt-8 pt-8 border-t border-white/5 flex gap-4 relative z-10">
                  <Button variant="primary">Upgrade Plan</Button>
                  <Button variant="ghost" className="border border-white/10 text-white/60 hover:text-white">Cancel Subscription</Button>
                </div>
              </div>

              {/* Payment Method */}
              <div className="glass border border-white/8 rounded-3xl p-8 flex flex-col justify-between">
                <div>
                  <h3 className="font-display font-semibold text-white mb-6">Payment Method</h3>
                  <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-center gap-4">
                    <div className="w-12 h-8 bg-white/10 rounded flex items-center justify-center">
                      <span className="text-xs font-bold text-white">VISA</span>
                    </div>
                    <div>
                      <p className="text-sm text-white font-medium">•••• 4242</p>
                      <p className="text-xs text-white/40">Expires 12/28</p>
                    </div>
                  </div>
                </div>
                <Button variant="ghost" className="w-full mt-6 border border-white/10 text-white/60 hover:text-white">Update Method</Button>
              </div>
            </div>

            {/* Included Features */}
            <section className="glass border border-white/8 rounded-3xl p-8">
              <h3 className="font-display font-semibold text-white mb-6">Pro Plan Features</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {['1,000 generation credits/mo', '4K Video Export', 'No Watermarks', 'Commercial License', 'Priority Render Queue', 'API Access'].map((feature) => (
                  <div key={feature} className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-neon-lime/10 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-3.5 h-3.5 text-neon-lime" />
                    </div>
                    <span className="text-sm text-white/70">{feature}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* Invoice History */}
            <section className="glass border border-white/8 rounded-3xl overflow-hidden">
              <div className="px-8 py-6 border-b border-white/6">
                <h3 className="font-display font-semibold text-white">Billing History</h3>
              </div>
              <div className="divide-y divide-white/5">
                {[
                  { date: 'Sep 14, 2026', amount: '$29.00', status: 'Paid', id: 'INV-2026-09' },
                  { date: 'Aug 14, 2026', amount: '$29.00', status: 'Paid', id: 'INV-2026-08' },
                  { date: 'Jul 14, 2026', amount: '$29.00', status: 'Paid', id: 'INV-2026-07' },
                ].map((invoice) => (
                  <div key={invoice.id} className="flex items-center justify-between px-8 py-4 hover:bg-white/2 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
                        <Clock className="w-4 h-4 text-white/40" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">{invoice.date}</p>
                        <p className="text-xs text-white/40">{invoice.id}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className="text-sm font-medium text-white">{invoice.amount}</p>
                        <p className="text-xs text-neon-lime">{invoice.status}</p>
                      </div>
                      <button className="p-2 rounded-lg hover:bg-white/5 text-white/40 hover:text-white transition-colors">
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-2.5 py-0.5 rounded-full bg-neon-lime/10 text-neon-lime text-[10px] font-bold uppercase tracking-wider border border-neon-lime/20">
      {children}
    </span>
  );
}
