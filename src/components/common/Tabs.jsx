/**
 * Simple controlled horizontal tab strip. Purely presentational — the
 * parent owns which tab is active and renders the matching panel below it.
 *
 * @param {{
 *   tabs: { key: string, label: string, icon?: React.ComponentType, count?: number, live?: boolean }[],
 *   active: string,
 *   onChange: (key: string) => void,
 * }} props
 */
export default function Tabs({ tabs, active, onChange }) {
  return (
    <div
      role="tablist"
      className="flex items-center gap-1 border-b border-ink-500/10 dark:border-white/10 overflow-x-auto scrollbar-none -mx-1 px-1"
    >
      {tabs.map(({ key, label, icon: Icon, count, live }) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={active === key}
          onClick={() => onChange(key)}
          className={`flex items-center gap-1.5 shrink-0 px-3 py-2.5 text-fluid-sm font-medium border-b-2 -mb-px transition-colors ${
            active === key
              ? 'border-brand-600 text-brand-700 dark:text-brand-300 bg-brand-500/8 rounded-t-lg'
              : 'border-transparent text-ink-500 hover:text-ink-900 dark:hover:text-white'
          }`}
        >
          {Icon && <Icon size={15} />}
          {label}
          {live && (
            <span className="relative flex w-2 h-2" title="Timer running">
              <span className="absolute inline-flex h-full w-full rounded-full bg-brand-500 opacity-60 animate-ping" />
              <span className="relative inline-flex w-2 h-2 rounded-full bg-brand-600" />
            </span>
          )}
          {typeof count === 'number' && count > 0 && (
            <span className="text-[10px] font-semibold bg-ink-500/10 dark:bg-white/10 rounded-full px-1.5 py-0.5 min-w-[16px] text-center">
              {count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
