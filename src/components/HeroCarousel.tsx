import React, { useState, useEffect, useRef, useCallback } from 'react';

export interface HeroCarouselProps {
  onNavigate?: (route: string) => void;
  onOpenSavingsModal?: () => void;
  onScrollToBooking?: () => void;
}

interface SlideData {
  id: string;
  headline: [string, string];
  description: string;
  image: string;
  alt: string;
}

export const HeroCarousel: React.FC<HeroCarouselProps> = () => {
  const [activeSlide, setActiveSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});

  // Touch gesture state
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);
  const touchEndY = useRef<number | null>(null);

  // 5-second automatic rotation
  const ROTATION_INTERVAL = 5000;

  // Exactly four simplified slides matching prompt specifications
  const slides: SlideData[] = [
    {
      id: 'slide-1',
      headline: ['Airport rides,', 'smarter together'],
      description: 'Verified pool rides from CSMIA. Save up to 40% on airport transit.',
      image: '/images/csmia-hero.jpg',
      alt: 'CSMIA illuminated airport terminal canopy at night with illuminated road',
    },
    {
      id: 'slide-2',
      headline: ['Travel with', 'trusted partners'],
      description: 'Verified drivers and commercial fleet partners for your airport journey.',
      image: '/images/fleet-safety.jpg',
      alt: 'Premium vehicle at airport pickup area',
    },
    {
      id: 'slide-3',
      headline: ['Save more on', 'every journey'],
      description: 'Share your airport ride with travellers heading in the same direction.',
      image: '/images/airport-pooling.jpg',
      alt: 'Cinematic airport road with cars and passengers',
    },
    {
      id: 'slide-4',
      headline: ['Your ride,', 'in clear view'],
      description: 'Stay informed with booking updates and live tracking when available.',
      image: '/images/live-visibility.jpg',
      alt: 'Night-time city road with subtle navigation visual',
    },
  ];

  // Detect reduced-motion preferences
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      setPrefersReducedMotion(mediaQuery.matches);

      const handleChange = (e: MediaQueryListEvent) => {
        setPrefersReducedMotion(e.matches);
      };
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, []);

  // Preload non-active slide images lazily
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const preloadTimer = setTimeout(() => {
      slides.slice(1).forEach((s) => {
        const img = new Image();
        img.src = s.image;
      });
    }, 1000);
    return () => clearTimeout(preloadTimer);
  }, []);

  // Pause rotation when tab is hidden
  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsPaused(document.hidden);
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // Carousel navigation handlers
  const nextSlide = useCallback(() => {
    setActiveSlide((prev) => (prev + 1) % slides.length);
  }, [slides.length]);

  const prevSlide = useCallback(() => {
    setActiveSlide((prev) => (prev - 1 + slides.length) % slides.length);
  }, [slides.length]);

  const goToSlide = (index: number) => {
    setActiveSlide(index);
  };

  // Automatic rotation timer - resets whenever activeSlide or pause state changes
  useEffect(() => {
    if (isPaused || prefersReducedMotion) return;

    const interval = setInterval(() => {
      nextSlide();
    }, ROTATION_INTERVAL);

    return () => clearInterval(interval);
  }, [activeSlide, isPaused, prefersReducedMotion, nextSlide]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      nextSlide();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      prevSlide();
    } else if (e.key === 'Home') {
      e.preventDefault();
      goToSlide(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      goToSlide(slides.length - 1);
    }
  };

  // Touch handlers for mobile swipe navigation
  const handleTouchStart = (e: React.TouchEvent) => {
    setIsPaused(true);
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    touchEndX.current = null;
    touchEndY.current = null;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
    touchEndY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = () => {
    setIsPaused(false);
    if (
      touchStartX.current === null ||
      touchEndX.current === null ||
      touchStartY.current === null ||
      touchEndY.current === null
    ) {
      return;
    }

    const deltaX = touchStartX.current - touchEndX.current;
    const deltaY = touchStartY.current - touchEndY.current;

    // Detect dominant horizontal swipe exceeding 40px threshold
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 40) {
      if (deltaX > 0) {
        nextSlide();
      } else {
        prevSlide();
      }
    }

    touchStartX.current = null;
    touchEndX.current = null;
    touchStartY.current = null;
    touchEndY.current = null;
  };

  return (
    <section
      role="region"
      aria-roledescription="carousel"
      aria-label="AeroPool Promotional Highlights"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocus={() => setIsPaused(true)}
      onBlur={() => setIsPaused(false)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="relative overflow-hidden rounded-3xl h-[280px] sm:h-[300px] flex flex-col justify-end p-5 sm:p-7 shadow-2xl border border-[rgba(75,150,220,0.18)] bg-[#0B1930] focus:outline-none focus:ring-1 focus:ring-[#00DDF5]/40 select-none cursor-grab active:cursor-grabbing"
    >
      {/* =========================================================================
          BACKGROUND PHOTOGRAPHS WITH SMOOTH CROSSFADE & SUBTLE ZOOM
         ========================================================================= */}
      <div className="absolute inset-0 z-0 overflow-hidden">
        {slides.map((s, idx) => {
          const isActive = idx === activeSlide;
          const hasError = imageErrors[s.id];

          return (
            <div
              key={s.id}
              className={`absolute inset-0 transition-opacity ${
                prefersReducedMotion ? 'duration-300' : 'duration-700'
              } ease-out ${isActive ? 'opacity-100 z-10' : 'opacity-0 pointer-events-none z-0'}`}
              aria-hidden={!isActive}
            >
              {hasError ? (
                <div className="w-full h-full bg-gradient-to-br from-[#07101F] via-[#0B1930] to-[#081b36]" />
              ) : (
                <img
                  src={s.image}
                  alt={s.alt}
                  loading={idx === 0 ? 'eager' : 'lazy'}
                  decoding="async"
                  onError={() => {
                    setImageErrors((prev) => ({ ...prev, [s.id]: true }));
                  }}
                  className={`w-full h-full object-cover object-right sm:object-center transition-transform ${
                    prefersReducedMotion ? 'duration-0' : 'duration-[6000ms]'
                  } ease-out ${isActive ? 'scale-100' : 'scale-105'}`}
                  style={{
                    filter: 'brightness(0.92) contrast(1.05)',
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* =========================================================================
          DARK NAVY GRADIENT OVERLAYS (Exact Match to Screenshot 2 Contrast)
         ========================================================================= */}
      {/* Left-to-right dark navy gradient guarantees 100% typography contrast */}
      <div className="absolute inset-0 bg-gradient-to-r from-[#07101F] via-[#07101F]/82 sm:via-[#07101F]/70 to-transparent z-10 pointer-events-none" />
      {/* Bottom subtle gradient for indicators */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#07101F]/90 via-[#07101F]/20 to-transparent z-10 pointer-events-none" />

      {/* =========================================================================
          HERO TEXT CONTENT (Simple, Clean, Compact — Matches Screenshot 2 Exactly)
         ========================================================================= */}
      <div className="relative z-20 space-y-2 max-w-xs sm:max-w-sm">
        {slides.map((s, idx) => {
          const isActive = idx === activeSlide;
          if (!isActive) return null;

          return (
            <div
              key={s.id}
              role="group"
              aria-roledescription="slide"
              aria-label={`Slide ${idx + 1} of ${slides.length}: ${s.headline.join(' ')}`}
              className={`transition-opacity ${
                prefersReducedMotion ? 'duration-200' : 'duration-500'
              } ease-out animate-in fade-in`}
            >
              {/* Short 2-Line Headline */}
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-[1.15]">
                {s.headline[0]}
                <br />
                {s.headline[1]}
              </h1>

              {/* Short Supporting Sentence */}
              <p className="text-xs sm:text-sm text-[#A8B5CA] leading-relaxed mt-2 max-w-[270px] sm:max-w-xs">
                {s.description}
              </p>
            </div>
          );
        })}

        {/* =========================================================================
            FOUR SMALL CAROUSEL INDICATORS (Active Short Cyan Pill + Muted Dots)
           ========================================================================= */}
        <div
          className="flex items-center gap-1.5 pt-2"
          role="tablist"
          aria-label="Carousel slide pagination"
        >
          {slides.map((s, idx) => {
            const isActive = idx === activeSlide;

            return (
              <button
                key={idx}
                type="button"
                role="tab"
                id={`carousel-tab-${idx}`}
                aria-selected={isActive}
                aria-controls={s.id}
                onClick={() => goToSlide(idx)}
                className={`transition-all duration-300 focus:outline-none focus:ring-1 focus:ring-[#00DDF5] cursor-pointer ${
                  isActive
                    ? 'w-6 h-1.5 rounded-full bg-[#00DDF5]'
                    : 'w-1.5 h-1.5 rounded-full bg-slate-600 hover:bg-slate-400'
                }`}
                aria-label={`Go to slide ${idx + 1}: ${s.headline.join(' ')}`}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
};
