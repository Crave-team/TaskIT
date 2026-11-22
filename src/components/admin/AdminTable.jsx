import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { panelClass } from '../teams/shared';

/**
 * A titled, searchable, scrollable table for the admin overview pages.
 * `columns`: [{ key, label, render(row), className? }]; `searchText(row)` is the
 * string the search box matches against.
 */
export default function AdminTable({ title, subtitle, rows, columns, searchText, empty = 'Nothing to show yet.' }) {
  const [query, setQuery] = useState('');
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? rows.filter((r) => searchText(r).toLowerCase().includes(q)) : rows;
  }, [rows, query, searchText]);

  return (
    <section className={`${panelClass} p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="font-display font-semibold text-fluid-base text-ink-900 dark:text-white">
            {title} <span className="text-ink-500 font-normal">({rows.length})</span>
          </h3>
          {subtitle && <p className="text-fluid-xs text-ink-500">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2 text-ink-500 bg-ink-500/5 dark:bg-white/5 border border-ink-500/10 dark:border-white/10 rounded-full px-3 py-1.5 w-full sm:w-64">
          <Search size={14} className="shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${title.toLowerCase()}…`}
            aria-label={`Search ${title}`}
            className="w-full bg-transparent text-fluid-xs text-ink-900 dark:text-white placeholder:text-ink-500 !border-0 !shadow-none !outline-none !h-auto !min-h-0"
          />
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-fluid-sm text-ink-500 py-6 text-center">{empty}</p>
      ) : (
        <div className="max-h-96 overflow-auto rounded-xl border border-ink-500/10 dark:border-white/10">
          <table className="w-full text-left">
            <thead className="sticky top-0 bg-surface-card dark:bg-surface-darkcard">
              <tr className="text-fluid-xs font-semibold text-ink-500 uppercase tracking-wide">
                {columns.map((c) => <th key={c.key} className={`px-4 py-2.5 whitespace-nowrap ${c.className || ''}`}>{c.label}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-500/8 dark:divide-white/8">
              {shown.map((r) => (
                <tr key={r.id} className="text-fluid-sm">
                  {columns.map((c) => <td key={c.key} className={`px-4 py-2.5 ${c.className || ''}`}>{c.render(r)}</td>)}
                </tr>
              ))}
              {shown.length === 0 && (
                <tr><td colSpan={columns.length} className="px-4 py-6 text-center text-fluid-sm text-ink-500">No matches.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
