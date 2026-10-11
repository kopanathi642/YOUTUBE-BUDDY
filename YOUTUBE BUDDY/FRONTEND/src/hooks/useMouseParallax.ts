'use client';
import { useEffect, useRef } from 'react';

export function useMouseParallax(strength = 20) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const x = (e.clientX - rect.left - rect.width / 2) / rect.width;
      const y = (e.clientY - rect.top - rect.height / 2) / rect.height;
      el.style.transform = `translate(${x * strength}px, ${y * strength}px)`;
    };

    const handleMouseLeave = () => {
      el.style.transform = 'translate(0, 0)';
      el.style.transition = 'transform 0.5s ease';
    };

    const parent = el.parentElement || window;
    (parent as HTMLElement).addEventListener('mousemove', handleMouseMove as EventListener);
    (parent as HTMLElement).addEventListener('mouseleave', handleMouseLeave);

    return () => {
      (parent as HTMLElement).removeEventListener('mousemove', handleMouseMove as EventListener);
      (parent as HTMLElement).removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [strength]);

  return ref;
}
