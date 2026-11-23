import { AreaChart, Area, ResponsiveContainer, Tooltip } from 'recharts';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { todayISO, toLocalISODate } from '../../data/mockData';
import { chartTooltipStyle, chartTooltipLabelStyle } from '../../utils/chartTheme';

/** Builds a 7-day forward-looking series of "tasks due that day" counts. */
function buildDueSeries(tasks) {
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const iso = toLocalISODate(d);
    const count = tasks.filter((t) => t.dueDate === iso && t.status !== 'done').length;
    days.push({ label: d.toLocaleDateString(undefined, { weekday: 'short' }), count });
  }
  return days;
}

/**
 * Large hero stat card: an open-task count with a 7-day due-date trend
 * sparkline on the left, and a compact 2×2 grid of secondary stats on the
 * right — mirrors the reference dashboard's big-number + sparkline layout,
 * built from real workspace data (no invented figures). Fully theme-aware
 * (light and dark), matching every other card on the page.
 *
 * @param {{ tasks: import('../../types').Task[], projects: import('../../types').Project[] }} props
 */
export default function HeroStat({ tasks, projects }) {
  const { theme } = useTheme();
  const open = tasks.filter((t) => t.status !== 'done');
  const done = tasks.length - open.length;
  const overdue = open.filter((t) => t.dueDate < todayISO()).length;
  const inReview = tasks.filter((t) => t.status === 'review').length;
  const series = buildDueSeries(tasks);
  const dueThisWeek = series.reduce((sum, d) => sum + d.count, 0);
  const dueLastPeriod = Math.max(1, open.length - dueThisWeek);
  const trendUp = dueThisWeek >= dueLastPeriod;

  const miniStats = [
    { label: 'Completed', value: done },
    { label: 'In review', value: inReview },
    { label: 'Overdue', value: overdue },
    { label: 'Active projects', value: projects.length },
  ];

  return (
    <div className="bg-surface-card dark:bg-surface-darkcard border border-ink-500/10 dark:border-white/10 rounded-2xl p-5 sm:p-6 shadow-soft">
      <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-6">
        <div>
          <p className="text-fluid-sm text-ink-500">Open tasks</p>
          <div className="flex items-baseline gap-3 mt-1">
            <p className="font-display font-bold text-fluid-3xl text-ink-900 dark:text-white leading-none">{open.length}</p>
            <span className={`flex items-center gap-1 text-fluid-xs font-medium ${trendUp ? 'text-brand-600 dark:text-brand-400' : 'text-coral-600 dark:text-coral-500'}`}>
              {trendUp ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
              {dueThisWeek} due this week
            </span>
          </div>
          <div className="h-16 mt-3 -mx-1">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 4, left: 0, right: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="heroTrend" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22C990" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#22C990" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Tooltip
                  contentStyle={chartTooltipStyle(theme)}
                  labelStyle={chartTooltipLabelStyle(theme)}
                  formatter={(v) => [`${v} due`, '']}
                />
                <Area type="monotone" dataKey="count" stroke="#22C990" strokeWidth={2} fill="url(#heroTrend)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {miniStats.map((s) => (
            <div key={s.label} className="bg-ink-500/5 dark:bg-white/5 border border-ink-500/8 dark:border-white/8 rounded-xl px-3.5 py-3">
              <p className="text-fluid-xs text-ink-500">{s.label}</p>
              <p className="font-display font-bold text-fluid-xl text-ink-900 dark:text-white mt-0.5">{s.value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
