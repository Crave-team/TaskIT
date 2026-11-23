/**
 * Slim horizontal progress bar used for task/project completion percentages.
 *
 * @param {{ value: number, tone?: 'brand'|'sage'|'amber'|'coral', showLabel?: boolean, size?: 'sm'|'md' }} props
 */
export default function ProgressBar({ value, tone = 'brand', showLabel = false, size = 'sm' }) {
  const clamped = Math.max(0, Math.min(100, value));
  const tones = {
    brand: 'bg-brand-600',
    sage: 'bg-sage-500',
    amber: 'bg-amber-500',
    coral: 'bg-coral-500',
  };
  const heights = { sm: 'h-1.5', md: 'h-2.5' };

  return (
    <div className="flex items-center gap-2">
      <div
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        className={`flex-1 rounded-full bg-ink-500/10 dark:bg-white/10 overflow-hidden ${heights[size]}`}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${tones[tone]}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
      {showLabel && (
        <span className="text-fluid-xs text-ink-500 shrink-0 w-9 text-right">{clamped}%</span>
      )}
    </div>
  );
}
