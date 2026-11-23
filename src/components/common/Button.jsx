/**
 * Shared button component. Keeps CTA styling consistent across the app so
 * primary actions (create, save) are always visually distinct from
 * secondary/ghost actions (cancel, close).
 *
 * @param {{
 *  children: React.ReactNode,
 *  variant?: 'primary'|'secondary'|'ghost'|'danger',
 *  size?: 'sm'|'md',
 *  icon?: React.ReactNode,
 *  className?: string,
 *  [key: string]: any
 * }} props
 */
export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  icon,
  className = '',
  ...rest
}) {
  const base =
    'inline-flex items-center justify-center gap-2 font-semibold rounded-full transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]';
  const variants = {
    primary:
      'bg-brand-700 text-white hover:bg-[#0B6F51] shadow-[0_1px_2px_rgba(10,74,56,0.25)]',
    secondary:
      'bg-white text-ink-900 border border-ink-500/15 shadow-soft hover:bg-ink-500/5 dark:bg-surface-darkcard dark:text-white dark:border-white/10 dark:hover:bg-white/5',
    ghost:
      'bg-transparent text-ink-700 hover:bg-ink-500/8 dark:text-ink-300 dark:hover:bg-white/5',
    danger:
      'bg-coral-500 text-white hover:bg-coral-600',
  };
  const sizes = {
    sm: 'text-fluid-xs px-3 py-1.5',
    md: 'text-fluid-sm px-4 py-2',
  };

  return (
    <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...rest}>
      {icon}
      {children}
    </button>
  );
}
