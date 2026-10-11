'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Mail, Lock, User } from 'lucide-react';
import toast from 'react-hot-toast';
import { signUpWithEmail, signInWithGoogle } from '@/lib/firebase';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import type { SignupFormData } from '@/types';

const schema = z
  .object({
    displayName: z.string().min(2, 'Name must be at least 2 characters'),
    email: z.string().email('Please enter a valid email'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Must contain an uppercase letter')
      .regex(/[0-9]/, 'Must contain a number'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export default function SignupPage() {
  const router = useRouter();
  const [googleLoading, setGoogleLoading] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SignupFormData>({ resolver: zodResolver(schema) });

  const password = watch('password', '');
  const passwordStrength = () => {
    let score = 0;
    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    return score;
  };
  const strength = passwordStrength();
  const strengthColors = ['bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-neon-lime'];
  const strengthLabels = ['Weak', 'Fair', 'Good', 'Strong'];

  const onSubmit = async (data: SignupFormData) => {
    try {
      await signUpWithEmail(data.email, data.password, data.displayName);
      toast.success('Account created! Welcome to YouTube Buddy 🎉');
      router.push('/dashboard');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Sign up failed. Please try again.';
      toast.error(message.includes('email-already-in-use') ? 'Email already registered.' : message);
    }
  };

  const handleGoogle = async () => {
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
      toast.success('Welcome to YouTube Buddy!');
      router.push('/dashboard');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Google sign-in failed.';
      if (!message.includes('popup-closed')) toast.error(message);
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center px-4 py-12 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-radial from-neon-cyan/6 via-transparent to-transparent" />
      <div
        className="absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage: `linear-gradient(rgba(34,211,238,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,0.5) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative w-full max-w-md"
      >
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <span className="font-display font-bold text-xl">
              YouTube<span className="text-neon-lime">Buddy</span>
            </span>
          </Link>
          <h1 className="font-display text-3xl font-bold text-white mt-6 mb-2">
            Start creating with AI
          </h1>
          <p className="text-white/40 text-sm">Free forever. No credit card required.</p>
        </div>

        <div className="glass border border-white/8 rounded-3xl p-8 shadow-card-glow">
          <Button
            type="button"
            variant="secondary"
            fullWidth
            loading={googleLoading}
            onClick={handleGoogle}
            className="mb-6 py-3 justify-center"
            leftIcon={
              !googleLoading && (
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
              )
            }
          >
            Continue with Google
          </Button>

          <div className="flex items-center gap-4 mb-6">
            <div className="flex-1 h-px bg-white/8" />
            <span className="text-white/25 text-xs">OR</span>
            <div className="flex-1 h-px bg-white/8" />
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input
              {...register('displayName')}
              label="Full name"
              placeholder="Your name"
              autoComplete="name"
              error={errors.displayName?.message}
              leftIcon={<User className="w-4 h-4" />}
            />
            <Input
              {...register('email')}
              label="Email address"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              error={errors.email?.message}
              leftIcon={<Mail className="w-4 h-4" />}
            />
            <div>
              <Input
                {...register('password')}
                label="Password"
                type="password"
                placeholder="Create a strong password"
                autoComplete="new-password"
                error={errors.password?.message}
                leftIcon={<Lock className="w-4 h-4" />}
              />
              {password.length > 0 && (
                <div className="mt-2">
                  <div className="flex gap-1 mb-1">
                    {[...Array(4)].map((_, i) => (
                      <div
                        key={i}
                        className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                          i < strength ? strengthColors[strength - 1] : 'bg-white/10'
                        }`}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-white/40">
                    Password strength:{' '}
                    <span className={`font-medium ${strength > 0 ? `text-${['red-400', 'orange-400', 'yellow-400', 'neon-lime'][strength - 1]}` : ''}`}>
                      {strength > 0 ? strengthLabels[strength - 1] : ''}
                    </span>
                  </p>
                </div>
              )}
            </div>
            <Input
              {...register('confirmPassword')}
              label="Confirm password"
              type="password"
              placeholder="Repeat your password"
              autoComplete="new-password"
              error={errors.confirmPassword?.message}
              leftIcon={<Lock className="w-4 h-4" />}
            />

            <Button type="submit" variant="primary" fullWidth loading={isSubmitting} className="py-3.5 mt-2">
              Create free account
            </Button>
          </form>

          <p className="text-center text-xs text-white/25 mt-4">
            By signing up you agree to our{' '}
            <Link href="/terms" className="text-white/40 hover:text-white transition-colors">Terms</Link>{' '}
            and{' '}
            <Link href="/privacy" className="text-white/40 hover:text-white transition-colors">Privacy Policy</Link>
          </p>

          <p className="text-center text-sm text-white/40 mt-4">
            Already have an account?{' '}
            <Link href="/login" className="text-neon-lime hover:text-lime-300 font-medium transition-colors">
              Sign in
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
