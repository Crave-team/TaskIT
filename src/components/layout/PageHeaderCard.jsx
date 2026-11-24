/**
 * Rounded card header shown at the top of every page's content: title +
 * subtitle on the left and an optional action slot on the right. (The global
 * search box lives in the top nav bar.)
 *
 * @param {{ title: string, subtitle?: string, action?: React.ReactNode }} props
 */
export default function PageHeaderCard({ title, subtitle, action }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-4 bg-surface-card bg-gradient-to-br from-[#F7F2E5] via-[#F1EDDD] to-[#DDEBDD] dark:bg-none dark:bg-surface-darkcard border border-ink-500/10 dark:border-white/10 shadow-soft rounded-2xl px-5 py-4 mb-5">
      <div className="min-w-0 flex-1">
        <h1 className="font-display font-bold text-fluid-xl text-ink-900 dark:text-white truncate leading-tight">{title}</h1>
        {subtitle && <p className="text-fluid-xs text-ink-500 truncate mt-0.5">{subtitle}</p>}
      </div>

      {action && <div className="flex items-center gap-2.5 shrink-0">{action}</div>}
    </div>
  );
}
