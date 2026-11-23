import { useEffect, useRef, useState } from 'react';

/**
 * Fades + slides its children into view the first time they scroll on
 * screen. Uses IntersectionObserver (falls back to "already visible" where
 * unsupported); the global reduced-motion rule in index.css removes the
 * movement for people who ask for less animation.
 *
 * @param {{ children: React.ReactNode, delay?: number, className?: string, as?: string, from?: 'up'|'left'|'right'|'none' }} props
 */
export default function Reveal({ children, delay = 0, className = '', as: Tag = 'div', from = 'up' }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(() => typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    if (shown) return undefined;
    const el = ref.current;
    if (!el) return undefined;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [shown]);

  const hidden = {
    up: 'opacity-0 translate-y-6',
    left: 'opacity-0 -translate-x-6',
    right: 'opacity-0 translate-x-6',
    none: 'opacity-0',
  }[from];

  return (
    <Tag
      ref={ref}
      style={{ transitionDelay: shown ? `${delay}ms` : '0ms' }}
      className={`transition-[opacity,transform] duration-700 ease-smooth will-change-transform ${
        shown ? 'opacity-100 translate-y-0 translate-x-0' : hidden
      } ${className}`}
    >
      {children}
    </Tag>
  );
}
