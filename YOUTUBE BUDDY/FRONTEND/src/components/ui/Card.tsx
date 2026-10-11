'use client';
import { HTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'glow-lime' | 'glow-cyan' | 'glow-purple' | 'solid';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  hover?: boolean;
}

const variants = {
  default: 'glass border border-white/8',
  'glow-lime': 'glass border-neon-lime/20 hover:border-neon-lime/40 hover:shadow-glow-lime',
  'glow-cyan': 'glass border-neon-cyan/20 hover:border-neon-cyan/40 hover:shadow-glow-cyan',
  'glow-purple': 'glass border-neon-purple/20 hover:border-neon-purple/40 hover:shadow-glow-purple',
  solid: 'bg-bg-card border border-white/6',
};

const paddings = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
};

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ variant = 'default', padding = 'md', hover = true, className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'rounded-2xl border transition-all duration-300',
          variants[variant],
          paddings[padding],
          hover && 'hover:translate-y-[-1px]',
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';

export function CardHeader({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex items-start justify-between mb-4', className)} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({ className, children, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn('text-lg font-semibold font-display text-white', className)} {...props}>
      {children}
    </h3>
  );
}

export function CardDescription({ className, children, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn('text-sm text-white/50', className)} {...props}>
      {children}
    </p>
  );
}
