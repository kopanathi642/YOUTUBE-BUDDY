'use client';
import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Zap, Mail, ArrowLeft, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { sendPasswordReset } from '@/lib/firebase';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

const schema = z.object({
  email: z.string().email('Please enter a valid email'),
});

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<{ email: string }>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: { email: string }) => {
    try {
      await sendPasswordReset(data.email);
      setSent(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      toast.error(message);
    }
  };

  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center px-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-radial from-neon-purple/6 via-transparent to-transparent" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative w-full max-w-md"
      >
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <div className="w-10 h-10 bg-neon-lime rounded-xl flex items-center justify-center shadow-glow-lime">
              <Zap className="w-5 h-5 text-black fill-black" />
            </div>
            <span className="font-display font-bold text-xl">
              YouTube<span className="text-neon-lime">Buddy</span>
            </span>
          </Link>
        </div>

        <div className="glass border border-white/8 rounded-3xl p-8 shadow-card-glow">
          {!sent ? (
            <>
              <div className="mb-8">
                <h1 className="font-display text-2xl font-bold text-white mb-2">
                  Reset your password
                </h1>
                <p className="text-white/40 text-sm">
                  Enter your email and we&apos;ll send you a link to reset your password.
                </p>
              </div>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <Input
                  {...register('email')}
                  label="Email address"
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  error={errors.email?.message}
                  leftIcon={<Mail className="w-4 h-4" />}
                />
                <Button
                  type="submit"
                  variant="primary"
                  fullWidth
                  loading={isSubmitting}
                  className="py-3.5"
                >
                  Send reset link
                </Button>
              </form>
            </>
          ) : (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-4"
            >
              <div className="w-16 h-16 bg-neon-lime/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle className="w-8 h-8 text-neon-lime" />
              </div>
              <h2 className="font-display text-2xl font-bold text-white mb-3">Check your inbox</h2>
              <p className="text-white/50 text-sm mb-2">
                We sent a password reset link to
              </p>
              <p className="text-neon-lime font-medium mb-8">{getValues('email')}</p>
              <p className="text-white/30 text-xs">
                Didn&apos;t receive it? Check your spam folder or{' '}
                <button
                  onClick={() => setSent(false)}
                  className="text-neon-lime hover:text-lime-300 transition-colors"
                >
                  try again
                </button>
              </p>
            </motion.div>
          )}

          <Link
            href="/login"
            className="flex items-center justify-center gap-2 mt-6 text-sm text-white/40 hover:text-white transition-colors group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            Back to sign in
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
