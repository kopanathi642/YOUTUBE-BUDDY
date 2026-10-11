'use client';
import { motion, useInView } from 'framer-motion';
import { useRef, useState } from 'react';
import { Star, ChevronLeft, ChevronRight } from 'lucide-react';

const testimonials = [
  {
    name: 'Marcus Chen',
    handle: '@marcustech',
    avatar: 'MC',
    role: 'Tech YouTuber • 890K subscribers',
    content:
      'YouTube Buddy completely transformed my workflow. I went from spending 8 hours on a video to 2 hours. The AI shorts generator alone is worth 10x the price.',
    rating: 5,
    stat: '+340% shorts performance',
  },
  {
    name: 'Priya Sharma',
    handle: '@priyacreates',
    avatar: 'PS',
    role: 'Lifestyle Creator • 1.2M subscribers',
    content:
      'The cinematic AI studio is insane. I can create visuals that look like they cost thousands of dollars in production. My audience thinks I hired a whole team.',
    rating: 5,
    stat: '5x content output',
  },
  {
    name: 'Jordan Rivers',
    handle: '@jordanr',
    avatar: 'JR',
    role: 'Gaming Creator • 2.1M subscribers',
    content:
      'The AI agents are like having 6 full-time employees. Trend agent finds my topics, script agent writes the outline, upload agent posts at perfect times. Game changer.',
    rating: 5,
    stat: '$12K revenue increase',
  },
  {
    name: 'Anika Hoffman',
    handle: '@anikacooks',
    avatar: 'AH',
    role: 'Food Creator • 560K subscribers',
    content:
      'I was skeptical about AI tools but YouTube Buddy proved me wrong. The transcription accuracy is incredible and the shorts it generates are legitimately viral.',
    rating: 5,
    stat: '1.2M new subscribers',
  },
];

export function Testimonials() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  const [active, setActive] = useState(0);

  const prev = () => setActive((a) => (a - 1 + testimonials.length) % testimonials.length);
  const next = () => setActive((a) => (a + 1) % testimonials.length);

  return (
    <section className="py-32 px-6 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-radial from-neon-lime/3 via-transparent to-transparent" />

      <div className="max-w-5xl mx-auto relative">
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          className="text-center mb-16"
        >
          <div className="flex items-center justify-center gap-1 mb-4">
            {[...Array(5)].map((_, i) => (
              <Star key={i} className="w-5 h-5 text-yellow-400 fill-yellow-400" />
            ))}
            <span className="ml-2 text-white/40 text-sm">4.9 / 5 from 2,400+ reviews</span>
          </div>
          <h2 className="font-display text-5xl font-bold text-white mb-4">
            Loved by{' '}
            <span className="text-gradient-lime">creators worldwide</span>
          </h2>
        </motion.div>

        {/* Testimonial Carousel */}
        <div className="relative">
          <div className="overflow-hidden rounded-3xl">
            <motion.div
              key={active}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.4 }}
              className="glass border border-white/8 rounded-3xl p-10 md:p-14"
            >
              <div className="flex flex-col md:flex-row gap-8 items-start">
                <div className="flex-1">
                  <div className="flex gap-1 mb-6">
                    {[...Array(testimonials[active].rating)].map((_, i) => (
                      <Star key={i} className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                    ))}
                  </div>
                  <p className="text-white/80 text-xl md:text-2xl leading-relaxed mb-8 font-light italic">
                    &ldquo;{testimonials[active].content}&rdquo;
                  </p>
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-neon-lime/20 border border-neon-lime/30 rounded-full flex items-center justify-center text-neon-lime font-bold">
                      {testimonials[active].avatar}
                    </div>
                    <div>
                      <p className="font-semibold text-white">{testimonials[active].name}</p>
                      <p className="text-sm text-white/40">{testimonials[active].role}</p>
                    </div>
                    <div className="ml-auto">
                      <span className="px-3 py-1.5 bg-neon-lime/10 border border-neon-lime/20 rounded-full text-xs text-neon-lime font-medium">
                        {testimonials[active].stat}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-center gap-4 mt-8">
            <button
              onClick={prev}
              className="w-10 h-10 rounded-full glass border border-white/10 flex items-center justify-center text-white/50 hover:text-white hover:border-white/30 transition-all"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="flex gap-2">
              {testimonials.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setActive(i)}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === active ? 'w-8 bg-neon-lime' : 'w-1.5 bg-white/20'
                  }`}
                />
              ))}
            </div>
            <button
              onClick={next}
              className="w-10 h-10 rounded-full glass border border-white/10 flex items-center justify-center text-white/50 hover:text-white hover:border-white/30 transition-all"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
