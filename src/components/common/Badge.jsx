/**
 * Small pill-shaped label used for priorities, tags, and status chips.
 *
 * @param {{ children: React.ReactNode, tone?: 'coral'|'amber'|'sage'|'brand'|'neutral', size?: 'sm'|'md' }} props
 */
export default function Badge({ children, tone = 'neutral', size = 'sm' }) {
  const tones = {
    coral: 'bg-coral-500/10 text-coral-600 dark:text-coral-500',
    amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-500',
    sage: 'bg-sage-500/10 text-sage-600 dark:text-sage-500',
    brand: 'bg-brand-500/10 text-brand-600 dark:text-brand-300',
    neutral: 'bg-ink-500/10 text-ink-700 dark:text-ink-300',
  };
  const sizes = {
    sm: 'text-fluid-xs px-2 py-0.5',
    md: 'text-fluid-sm px-2.5 py-1',
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium whitespace-nowrap ${tones[tone]} ${sizes[size]}`}
    >
      {children}
    </span>
  );
}
