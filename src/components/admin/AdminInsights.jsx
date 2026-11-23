import { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Timer, Users, UsersRound } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { chartTooltipStyle, chartCursorFill } from '../../utils/chartTheme';
import {
  monthWindow, createdPerMonth, deadlinesPerMonth, priorityCounts, finishStats, formatDuration, summaryTiles, monthKeyOf,
} from '../../utils/adminStats';
import { panelClass } from '../teams/shared';

const TASK_COLOR = '#16A87A';
const PROJECT_COLOR = '#D9A441';

function Card({ title, subtitle, action, children, className = '' }) {
  return (
    <section className={`${panelClass} p-5 ${className}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="font-display font-semibold text-fluid-base text-ink-900 dark:text-white">{title}</h3>
          {subtitle && <p className="text-fluid-xs text-ink-500">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function RangeToggle({ value, onChange }) {
  return (
    <div className="inline-flex rounded-lg border border-ink-500/15 dark:border-white/10 p-0.5 shrink-0" role="group" aria-label="Time range">
      {[6, 12].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          aria-pressed={value === n}
          className={`px-2.5 py-1 rounded-md text-fluid-xs font-medium transition-colors ${value === n ? 'bg-brand-700 text-white' : 'text-ink-500 hover:text-ink-900 dark:hover:text-white'}`}
        >
          {n} mo
        </button>
      ))}
    </div>
  );
}

/** Two-series bar chart (Tasks vs Projects) with theme-aware axes and tooltip. */
function PairBars({ data, xKey, theme, height = 260 }) {
  const tick = { fill: 'currentColor', fontSize: 12 };
  return (
    <div className="text-ink-700 dark:text-ink-300" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(26,29,36,0.1)'} />
          <XAxis dataKey={xKey} tick={tick} tickLine={false} axisLine={false} />
          <YAxis allowDecimals={false} tick={tick} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={chartTooltipStyle(theme)} cursor={{ fill: chartCursorFill(theme) }} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="Tasks" fill={TASK_COLOR} radius={[4, 4, 0, 0]} maxBarSize={28} />
          <Bar dataKey="Projects" fill={PROJECT_COLOR} radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * The super-admin analytics block, reused by the admin Dashboard (everything),
 * My Workspace (individual work only) and Team (team work only). It is given the
 * tasks/projects to analyse and draws: what was created each month (+ four
 * summary tiles with percentages), what reaches its deadline each month, the
 * priority mix, and how long finished tasks took (with the average). When
 * `accounts` and `groups` are passed it also adds the users-and-teams chart.
 *
 * @param {{ tasks: any[], projects: any[], accounts?: any[], groups?: any[], scopeLabel?: (t:any)=>string, ownerOf?: (t:any)=>string }} props
 */
export default function AdminInsights({ tasks, projects, accounts, groups, ownerOf, scopeLabel }) {
  const { theme } = useTheme();
  const [createdRange, setCreatedRange] = useState(6);
  const [deadlineRange, setDeadlineRange] = useState(6);

  const created = useMemo(() => createdPerMonth(tasks, projects, monthWindow(createdRange)), [tasks, projects, createdRange]);
  // Deadlines look ahead too: the window ends two months from now.
  const deadlines = useMemo(() => deadlinesPerMonth(tasks, projects, monthWindow(deadlineRange, 2)), [tasks, projects, deadlineRange]);
  const priority = useMemo(() => priorityCounts(tasks, projects), [tasks, projects]);
  const finish = useMemo(() => finishStats(tasks), [tasks]);
  const tiles = useMemo(() => summaryTiles(tasks, projects), [tasks, projects]);

  const people = useMemo(() => {
    if (!accounts || !groups) return null;
    const win = monthWindow(6);
    const members = accounts.filter((a) => a.accountRole !== 'admin');
    return {
      users: members.length,
      admins: accounts.length - members.length,
      teams: groups.length,
      monthly: win.map((m) => ({
        month: m.label,
        'New users': members.filter((a) => monthKeyOf(a.createdAt) === m.key).length,
        'New teams': groups.filter((g) => monthKeyOf(g.createdAt) === m.key).length,
      })),
    };
  }, [accounts, groups]);

  const tick = { fill: 'currentColor', fontSize: 12 };

  return (
    <div className="space-y-5">
      {/* 1 · Created per month + the four tiles on the right */}
      <Card
        title="Created each month"
        subtitle="How many tasks and projects were created."
        action={<RangeToggle value={createdRange} onChange={setCreatedRange} />}
      >
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] gap-5">
          <PairBars data={created} xKey="month" theme={theme} />
          <div className="grid grid-cols-2 gap-3 content-start" aria-label="Totals">
            {tiles.map((t) => (
              <div key={t.key} className="rounded-xl bg-ink-500/[0.05] dark:bg-white/[0.04] p-3.5">
                <p className="text-fluid-xs text-ink-500">{t.label}</p>
                <p className="mt-1 font-display font-bold text-fluid-2xl text-ink-900 dark:text-white leading-none">{t.value}</p>
                <p className="mt-1.5 text-fluid-xs font-medium text-brand-700 dark:text-brand-300">{t.percent}% {t.note}</p>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* 2 · Deadlines and priority */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Card
          title="Reaching deadline each month"
          subtitle="Tasks by due date and projects by deadline (or last milestone)."
          action={<RangeToggle value={deadlineRange} onChange={setDeadlineRange} />}
        >
          <PairBars data={deadlines} xKey="month" theme={theme} />
        </Card>
        <Card title="Priority level" subtitle="Tasks and projects at each priority.">
          <PairBars data={priority} xKey="level" theme={theme} />
        </Card>
      </div>

      {/* 3 · Time to finish */}
      <Card
        title="Time to finish"
        subtitle="Time spent on each finished task (tracked time; if none, creation to completion)."
        action={
          <div className="text-right shrink-0">
            <p className="text-fluid-xs text-ink-500 flex items-center justify-end gap-1.5"><Timer size={13} /> Average</p>
            <p className="font-display font-bold text-fluid-xl text-ink-900 dark:text-white leading-tight">{formatDuration(finish.average)}</p>
          </div>
        }
      >
        {finish.rows.length === 0 ? (
          <p className="text-fluid-sm text-ink-500 py-6 text-center">No finished tasks yet.</p>
        ) : (
          <div className="max-h-80 overflow-auto rounded-xl border border-ink-500/10 dark:border-white/10">
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-surface-card dark:bg-surface-darkcard">
                <tr className="text-fluid-xs font-semibold text-ink-500 uppercase tracking-wide">
                  <th className="px-4 py-2.5">Task</th>
                  <th className="px-4 py-2.5">Who</th>
                  <th className="px-4 py-2.5">Where</th>
                  <th className="px-4 py-2.5 text-right">Time</th>
                  <th className="px-4 py-2.5 text-right hidden sm:table-cell">Finished</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-500/8 dark:divide-white/8">
                {finish.rows.map(({ task, minutes, finishedAt }) => (
                  <tr key={task.id} className="text-fluid-sm">
                    <td className="px-4 py-2.5 text-ink-900 dark:text-white max-w-[16rem] truncate">{task.title}</td>
                    <td className="px-4 py-2.5 text-ink-700 dark:text-ink-300">{ownerOf ? ownerOf(task) : task.assignee}</td>
                    <td className="px-4 py-2.5 text-ink-500">{scopeLabel ? scopeLabel(task) : task.groupId ? 'Team' : 'My Workspace'}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-ink-900 dark:text-white whitespace-nowrap">{formatDuration(minutes)}</td>
                    <td className="px-4 py-2.5 text-right text-ink-500 whitespace-nowrap hidden sm:table-cell">
                      {finishedAt ? new Date(finishedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* 4 · Users & teams (Dashboard only) */}
      {people && (
        <Card title="Users and teams" subtitle="Everyone who has signed up, and every team created.">
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] gap-5">
            <div className="grid grid-cols-2 lg:grid-cols-1 gap-3 content-start">
              <div className="rounded-xl bg-ink-500/[0.05] dark:bg-white/[0.04] p-4">
                <p className="flex items-center gap-2 text-fluid-xs text-ink-500"><Users size={14} className="text-brand-600" /> Individual users</p>
                <p className="mt-1 font-display font-bold text-fluid-2xl text-ink-900 dark:text-white leading-none">{people.users}</p>
                {people.admins > 0 && <p className="mt-1.5 text-fluid-xs text-ink-500">+ {people.admins} admin{people.admins === 1 ? '' : 's'}</p>}
              </div>
              <div className="rounded-xl bg-ink-500/[0.05] dark:bg-white/[0.04] p-4">
                <p className="flex items-center gap-2 text-fluid-xs text-ink-500"><UsersRound size={14} className="text-amber-600" /> Teams created</p>
                <p className="mt-1 font-display font-bold text-fluid-2xl text-ink-900 dark:text-white leading-none">{people.teams}</p>
              </div>
            </div>
            <div className="text-ink-700 dark:text-ink-300" style={{ height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={[{ name: 'Individual users', Total: people.users }, { name: 'Teams', Total: people.teams }]} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(26,29,36,0.1)'} />
                  <XAxis type="number" allowDecimals={false} tick={tick} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="name" tick={tick} tickLine={false} axisLine={false} width={110} />
                  <Tooltip contentStyle={chartTooltipStyle(theme)} cursor={{ fill: chartCursorFill(theme) }} />
                  <Bar dataKey="Total" fill={TASK_COLOR} radius={[0, 4, 4, 0]} maxBarSize={34} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <p className="mt-4 mb-2 text-fluid-xs font-semibold uppercase tracking-wide text-ink-500">New sign-ups and teams per month</p>
          <div className="text-ink-700 dark:text-ink-300" style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={people.monthly} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(26,29,36,0.1)'} />
                <XAxis dataKey="month" tick={tick} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tick={tick} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={chartTooltipStyle(theme)} cursor={{ fill: chartCursorFill(theme) }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="New users" fill={TASK_COLOR} radius={[4, 4, 0, 0]} maxBarSize={28} />
                <Bar dataKey="New teams" fill={PROJECT_COLOR} radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}
    </div>
  );
}
