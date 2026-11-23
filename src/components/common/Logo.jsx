import { useId } from 'react';

/**
 * The TaskIT brand mark: a rounded tile in the brand greens holding a bold
 * check (work done) with a small amber dot (the deadline that keeps it
 * moving). Same artwork as /public/favicon.svg.
 *
 * @param {{ size?: number, className?: string }} props
 */
export function LogoMark({ size = 32, className = '' }) {
  const uid = useId().replace(/:/g, '');
  const bg = `taskit-bg-${uid}`;
  const shine = `taskit-shine-${uid}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={bg} x1="6" y1="2" x2="42" y2="46" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#2FDDA2" />
          <stop offset="0.55" stopColor="#16A87A" />
          <stop offset="1" stopColor="#0A5C44" />
        </linearGradient>
        <linearGradient id={shine} x1="24" y1="2" x2="24" y2="26" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff" stopOpacity="0.28" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="44" height="44" rx="13" fill={`url(#${bg})`} />
      <rect x="2" y="2" width="44" height="44" rx="13" fill={`url(#${shine})`} />
      <path d="M13.5 25.5 21 33l13.5-15.5" stroke="#fff" strokeWidth="5.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="36.5" cy="11.5" r="6" fill="#0F7456" />
      <circle cx="36.5" cy="11.5" r="4.2" fill="#D9A441" />
    </svg>
  );
}

/**
 * Logo lockup: mark + "TaskIT" wordmark. Set `tone="light"` on dark-green
 * surfaces (e.g. the footer) so the wordmark stays readable.
 *
 * @param {{ size?: number, showText?: boolean, tone?: 'auto'|'light', className?: string, textClassName?: string }} props
 */
export default function Logo({ size = 32, showText = true, tone = 'auto', className = '', textClassName = '' }) {
  const base = tone === 'light' ? 'text-white' : 'text-ink-900 dark:text-white';
  const accent = tone === 'light' ? 'text-brand-300' : 'text-brand-600 dark:text-brand-300';
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark size={size} />
      {showText && (
        <span className={`font-display font-extrabold tracking-tight leading-none text-fluid-xl ${base} ${textClassName}`}>
          Task<span className={accent}>IT</span>
        </span>
      )}
    </span>
  );
}
