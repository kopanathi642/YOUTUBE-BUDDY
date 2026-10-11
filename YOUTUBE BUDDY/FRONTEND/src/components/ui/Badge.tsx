'use client';
import { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'lime' | 'cyan' | 'purple' | 'red' | 'yellow' | 'gray' | 'default';
  size?: 'sm' | 'md';
  dot?: boolean;
}

const variants = {
  lime: 'bg-neon-lime/10 text-neon-lime border-neon-lime/30',
  cyan: 'bg-neon-cyan/10 text-neon-cyan border-neon-cyan/30',
  purple: 'bg-neon-purple/10 text-neon-purple border-neon-purple/30',
  red: 'bg-red-500/10 text-red-400 border-red-500/30',
  yellow: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
  gray: 'bg-white/5 text-white/50 border-white/10',
  default: 'bg-white/5 text-white/70 border-white/10',
};

const dotColors = {
  lime: 'bg-neon-lime shadow-[0_0_4px_rgba(163,230,53,0.8)]',
  cyan: 'bg-neon-cyan',
  purple: 'bg-neon-purple',
  red: 'bg-red-400',
  yellow: 'bg-yellow-400',
  gray: 'bg-white/40',
  default: 'bg-white/40',
};

const sizes = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-3 py-1 text-xs',
};

export function Badge({
  variant = 'default',
  size = 'md',
  dot = false,
  className,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-medium',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {dot && (
        <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', dotColors[variant])} />
      )}
      {children}
    </span>
  );
}
