import { useMemo } from 'react';
import { GanttChartSquare, CheckCircle2 } from 'lucide-react';
import EmptyState from '../common/EmptyState';
import { PRIORITY_META, STATUS_META, TEAM_STATUS_META, todayISO } from '../../data/mockData';
import { parseISODate, toISODate } from '../../utils/date';

const barColor = { low: 'bg-sage-500', medium: 'bg-amber-500', high: 'bg-coral-500' };
const barSoft = { low: 'bg-sage-500/30', medium: 'bg-amber-500/30', high: 'bg-coral-500/30' };
const DAY_MS = 24 * 60 * 60 * 1000;
const LABEL_W = 208; // px, the sticky task-name column

const diffDays = (a, b) => Math.round((b - a) / DAY_MS);
const fmtShort = (d) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const progressOf = (t) => (t.status === 'done' ? 100 : t.status === 'review' ? 80 : t.status === 'in-progress' ? 45 : 0);

/** A task's bar runs from the day it was created to its due date (always at least one day long). */
function rangeOf(task) {
  const created = parseISODate(toISODate(new Date(task.createdAt || Date.now())));
  const due = parseISODate(task.dueDate) || created;
  const start = created > due ? due : created;
  return { start, end: due };
}

/**
 * Timeline (Gantt) view. A day/week scale runs across the top with a "today" marker;
 * every task is one bar from its creation to its due date, coloured by priority and
 * filled in by progress. Overdue work is ringed in coral and finished work is ticked.
 *
 * @param {{
 *  tasks: import('../../types').Task[],
 *  projects?: import('../../types').Project[],   // when given, rows are grouped under their project
 *  showAssignee?: boolean,
 *  team?: boolean,                                // team boards word the review status "To Review"
 * }} props
 */
export default function GanttChart({ tasks, projects = null, showAssignee = true, team = false }) {
  const statusMeta = team ? TEAM_STATUS_META : STATUS_META;

  const model = useMemo(() => {
    if (tasks.length === 0) return null;
    const today = parseISODate(todayISO());
    const ranges = tasks.map(rangeOf);
    let min = new Date(Math.min(today, ...ranges.map((r) => r.start)));
    let max = new Date(Math.max(today, ...ranges.map((r) => r.end)));
    min = new Date(min.getFullYear(), min.getMonth(), min.getDate() - 1);
    max = new Date(max.getFullYear(), max.getMonth(), max.getDate() + 2);
    if (diffDays(min, max) < 14) max = new Date(min.getFullYear(), min.getMonth(), min.getDate() + 14);
    const totalDays = diffDays(min, max) + 1;
    const dayW = totalDays > 120 ? 12 : totalDays > 60 ? 20 : 30;

    const days = Array.from({ length: totalDays }, (_, i) => new Date(min.getFullYear(), min.getMonth(), min.getDate() + i));
    const months = [];
    days.forEach((d, i) => {
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const last = months[months.length - 1];
      if (last && last.key === key) last.span += 1;
      else months.push({ key, label: d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }), span: 1, start: i });
    });

    const rows = tasks
      .map((t, i) => ({ task: t, ...ranges[i] }))
      .sort((a, b) => a.end - b.end || a.start - b.start);

    let groups;
    if (projects) {
      groups = projects
        .map((p) => ({ key: p.id, title: p.name, color: p.color, rows: rows.filter((r) => r.task.projectId === p.id) }))
        .filter((g) => g.rows.length > 0);
    } else {
      groups = [{ key: 'all', title: null, rows }];
    }
    return { min, totalDays, dayW, days, months, groups, todayIdx: diffDays(min, today) };
  }, [tasks, projects]);

  if (!model) {
    return (
      <EmptyState
        icon={GanttChartSquare}
        title="Nothing to chart yet"
        description="Tasks with a due date will appear here as timeline bars."
      />
    );
  }

  const { min, totalDays, dayW, days, months, groups, todayIdx } = model;
  const trackW = totalDays * dayW;
  const today = todayISO();
  const showDayNumbers = dayW >= 20;

  return (
    <div className="bg-surface-card dark:bg-surface-darkcard border border-ink-500/10 dark:border-white/10 shadow-soft rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <div style={{ width: LABEL_W + trackW, minWidth: '100%' }}>
          {/* time scale */}
          <div className="flex sticky top-0 z-[1] bg-surface-card dark:bg-surface-darkcard border-b border-ink-500/10 dark:border-white/10">
            <div style={{ width: LABEL_W }} className="shrink-0 sticky left-0 z-[2] bg-surface-card dark:bg-surface-darkcard border-r border-ink-500/10 dark:border-white/10 px-4 py-2 text-fluid-xs font-semibold uppercase tracking-wide text-ink-500 flex items-end">
              Task
            </div>
            <div style={{ width: trackW }} className="shrink-0">
              <div className="flex">
                {months.map((m) => (
                  <div key={m.key} style={{ width: m.span * dayW }} className="px-2 py-1 text-fluid-xs font-semibold text-ink-700 dark:text-ink-300 border-l border-ink-500/10 dark:border-white/10 truncate">
                    {m.span * dayW > 70 ? m.label : ''}
                  </div>
                ))}
              </div>
              <div className="flex">
                {days.map((d, i) => {
                  const isToday = i === todayIdx;
                  const weekend = d.getDay() === 0 || d.getDay() === 6;
                  return (
                    <div
                      key={i}
                      style={{ width: dayW }}
                      className={`text-center text-[10px] py-1 ${isToday ? 'font-bold text-brand-700 dark:text-brand-300' : weekend ? 'text-ink-500/60' : 'text-ink-500'}`}
                    >
                      {showDayNumbers ? d.getDate() : d.getDay() === 1 ? d.getDate() : ''}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* rows */}
          {groups.map((g) => (
            <div key={g.key}>
              {g.title && (
                <div className="flex bg-ink-500/[0.05] dark:bg-white/[0.04] border-b border-ink-500/8 dark:border-white/8">
                  <div style={{ width: LABEL_W }} className="sticky left-0 z-[1] bg-inherit px-4 py-1.5 text-fluid-xs font-semibold text-ink-900 dark:text-white truncate">
                    {g.title} <span className="font-normal text-ink-500">· {g.rows.length}</span>
                  </div>
                </div>
              )}
              {g.rows.map(({ task, start, end }) => {
                const offset = diffDays(min, start);
                const span = diffDays(start, end) + 1;
                const overdue = task.status !== 'done' && task.status !== 'review' && task.dueDate < today;
                const pct = progressOf(task);
                return (
                  <div key={task.id} className="flex items-stretch border-b border-ink-500/8 dark:border-white/8 last:border-b-0 hover:bg-brand-500/[0.04] transition-colors group/row">
                    <div style={{ width: LABEL_W }} className="shrink-0 sticky left-0 z-[1] bg-surface-card dark:bg-surface-darkcard group-hover/row:bg-[#EEF1E2] dark:group-hover/row:bg-[#1A1E24] border-r border-ink-500/10 dark:border-white/10 px-4 py-2 min-w-0 transition-colors">
                      <p className="text-fluid-xs font-medium text-ink-900 dark:text-white truncate">{task.title}</p>
                      <p className="text-fluid-xs text-ink-500 truncate">
                        {showAssignee && task.assignee ? `${task.assignee} · ` : ''}{statusMeta[task.status]?.label}
                      </p>
                    </div>
                    <div style={{ width: trackW }} className="relative shrink-0">
                      {/* weekend shading */}
                      {days.map((d, i) => (d.getDay() === 0 || d.getDay() === 6) && (
                        <span key={i} style={{ left: i * dayW, width: dayW }} className="absolute inset-y-0 bg-ink-500/[0.04] dark:bg-white/[0.03]" aria-hidden="true" />
                      ))}
                      {todayIdx >= 0 && todayIdx < totalDays && (
                        <span style={{ left: todayIdx * dayW + dayW / 2 }} className="absolute inset-y-0 w-px bg-brand-600/60" aria-hidden="true" />
                      )}
                      <div
                        className={`absolute top-1/2 -translate-y-1/2 h-6 rounded-full overflow-hidden ${barSoft[task.priority]} ${overdue ? 'ring-2 ring-coral-500/60' : ''}`}
                        style={{ left: offset * dayW + 2, width: Math.max(dayW - 4, span * dayW - 4) }}
                        title={`${task.title}\n${fmtShort(start)} → ${fmtShort(end)} · ${PRIORITY_META[task.priority].label} priority · ${pct}%${overdue ? ' · overdue' : ''}`}
                      >
                        <div className={`absolute inset-y-0 left-0 ${barColor[task.priority]}`} style={{ width: `${pct}%` }} />
                        <span className="relative flex h-full items-center gap-1 px-2 text-[10px] font-semibold text-ink-900 dark:text-white whitespace-nowrap">
                          {task.status === 'done' && <CheckCircle2 size={11} />}
                          {span * dayW > 90 ? `${pct}%` : ''}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 border-t border-ink-500/10 dark:border-white/10 text-fluid-xs text-ink-500">
        {Object.entries(PRIORITY_META).map(([key, meta]) => (
          <span key={key} className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-full ${barColor[key]}`} />
            {meta.label} priority
          </span>
        ))}
        <span className="flex items-center gap-1.5"><span className="w-px h-3 bg-brand-600" /> Today</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full ring-2 ring-coral-500/60" /> Overdue</span>
        <span className="ml-auto">Bar fill = progress</span>
      </div>
    </div>
  );
}
