import { useMemo } from 'react';
import { usePersistedState } from '../../hooks/usePersistedState';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { BarChart3, CheckCircle2, ClipboardCheck, AlertTriangle, ListChecks, Gauge } from 'lucide-react';
import EmptyState from '../common/EmptyState';
import ProgressBar from '../common/ProgressBar';
import { panelClass } from './shared';
import { TEAM_STATUS_META, PRIORITY_META, todayISO } from '../../data/mockData';
import { useTasks } from '../../context/TaskContext';
import { useTheme } from '../../context/ThemeContext';
import { chartTooltipStyle, chartCursorFill } from '../../utils/chartTheme';

const statusColor = { todo: '#6B7280', 'in-progress': '#8C97C4', review: '#D9A441', done: '#16A87A' };
const priorityColor = { low: '#4E8D7C', medium: '#D9A441', high: '#E8604C' };

function Kpi({ icon: Icon, label, value, hint, tone = 'text-brand-600' }) {
  return (
    <div className={`${panelClass} p-4`}>
      <div className="flex items-center gap-2 text-fluid-xs text-ink-500">
        <span className={`w-7 h-7 rounded-lg bg-ink-500/8 dark:bg-white/8 flex items-center justify-center ${tone}`}><Icon size={14} /></span>
        {label}
      </div>
      <p className="mt-2 font-display font-bold text-fluid-2xl text-ink-900 dark:text-white leading-none">{value}</p>
      {hint && <p className="mt-1 text-fluid-xs text-ink-500">{hint}</p>}
    </div>
  );
}

function ChartCard({ title, subtitle, children, className = '' }) {
  return (
    <div className={`${panelClass} p-5 ${className}`}>
      <h3 className="font-display font-semibold text-fluid-base text-ink-900 dark:text-white">{title}</h3>
      {subtitle && <p className="text-fluid-xs text-ink-500 mb-3">{subtitle}</p>}
      {children}
    </div>
  );
}

/**
 * Reports for ONE team: its own task status, priority, project and member workload
 * diagrams. (The Dashboard is personal — it only covers "My Workspace".) Narrow it to a
 * single project with the picker.
 */
export default function TeamReportsTab({ group, members }) {
  const { allTasks, allProjects } = useTasks();
  const { theme } = useTheme();
  const [projectId, setProjectId] = usePersistedState(`team.${group.id}.reports.projectId`, 'all');

  const projects = allProjects.filter((p) => p.groupId === group.id && !p.archived);
  const tasks = useMemo(
    () => allTasks.filter((t) => t.groupId === group.id && (projectId === 'all' ? projects.some((p) => p.id === t.projectId) : t.projectId === projectId)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allTasks, group.id, projectId, allProjects]
  );

  const today = todayISO();
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === 'done').length;
  const toReview = tasks.filter((t) => t.status === 'review').length;
  const overdue = tasks.filter((t) => t.status !== 'done' && t.status !== 'review' && t.dueDate < today).length;
  const completion = total ? Math.round((done / total) * 100) : 0;

  const statusData = Object.entries(TEAM_STATUS_META).map(([key, m]) => ({ key, name: m.label, value: tasks.filter((t) => t.status === key).length }));
  const priorityData = Object.entries(PRIORITY_META).map(([key, m]) => ({ key, name: m.label, value: tasks.filter((t) => t.priority === key).length }));
  const projectData = projects.map((p) => {
    const pt = tasks.filter((t) => t.projectId === p.id);
    return { name: p.name, tasks: pt.length, done: pt.filter((t) => t.status === 'done').length };
  });
  // People are matched by id; the empty bucket (id null) is the unassigned work.
  const people = [...members.map((m) => ({ id: m.id, name: m.name })), ...(tasks.some((t) => !t.assigneeId) ? [{ id: null, name: 'Unassigned' }] : [])];
  const workloadData = people.map(({ id, name }) => {
    const mine = tasks.filter((t) => (t.assigneeId ?? null) === id);
    return {
      name: name.split(' ')[0],
      todo: mine.filter((t) => t.status === 'todo' || t.status === 'in-progress').length,
      review: mine.filter((t) => t.status === 'review').length,
      done: mine.filter((t) => t.status === 'done').length,
    };
  });
  const timeData = projects.map((p) => {
    const minutes = tasks.filter((t) => t.projectId === p.id).flatMap((t) => t.timeEntries || []).reduce((sum, e) => sum + e.minutes, 0);
    return { name: p.name, hours: Math.round((minutes / 60) * 10) / 10 };
  });

  const tick = { fill: 'currentColor', fontSize: 12 };
  const tickClass = 'text-ink-700 dark:text-ink-300';
  const tooltipStyle = chartTooltipStyle(theme);
  const cursor = { fill: chartCursorFill(theme) };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-fluid-sm font-semibold text-ink-900 dark:text-white">Team report</p>
          <p className="text-fluid-xs text-ink-500">How work is distributed and progressing in {group.name}.</p>
        </div>
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          aria-label="Filter report by project"
          className="text-fluid-sm bg-white dark:bg-surface-darkcard border border-ink-500/15 dark:border-white/10 rounded-lg pl-3 text-ink-900 dark:text-white focus:outline-none"
        >
          <option value="all">All projects</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {total === 0 ? (
        <EmptyState icon={BarChart3} title="No team tasks to report on yet" description="Once your group admin assigns tasks in a project, the team's diagrams appear here." />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Kpi icon={ListChecks} label="Total tasks" value={total} />
            <Kpi icon={CheckCircle2} label="Approved" value={done} hint="Done" />
            <Kpi icon={ClipboardCheck} label="To review" value={toReview} tone="text-amber-600" hint="Waiting for an admin" />
            <Kpi icon={AlertTriangle} label="Overdue" value={overdue} tone="text-coral-600" />
            <div className={`${panelClass} p-4 col-span-2 lg:col-span-1`}>
              <div className="flex items-center gap-2 text-fluid-xs text-ink-500">
                <span className="w-7 h-7 rounded-lg bg-ink-500/8 dark:bg-white/8 flex items-center justify-center text-brand-600"><Gauge size={14} /></span>
                Completion
              </div>
              <p className="mt-2 font-display font-bold text-fluid-2xl text-ink-900 dark:text-white leading-none">{completion}%</p>
              <div className="mt-2"><ProgressBar value={completion} size="sm" /></div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title="Tasks by status" subtitle="Where work sits in the review flow">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                    {statusData.map((d) => <Cell key={d.key} fill={statusColor[d.key]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Tasks by priority" subtitle="Where urgency is concentrated">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={priorityData} margin={{ left: -20 }}>
                  <XAxis dataKey="name" tick={tick} axisLine={false} tickLine={false} className={tickClass} />
                  <YAxis allowDecimals={false} tick={tick} axisLine={false} tickLine={false} className={tickClass} />
                  <Tooltip contentStyle={tooltipStyle} cursor={cursor} />
                  <Bar dataKey="value" name="Tasks" radius={[6, 6, 0, 0]}>
                    {priorityData.map((d) => <Cell key={d.key} fill={priorityColor[d.key]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Member workload" subtitle="Open, in review and approved tasks per person">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={workloadData} margin={{ left: -20 }}>
                  <XAxis dataKey="name" tick={tick} axisLine={false} tickLine={false} className={tickClass} />
                  <YAxis allowDecimals={false} tick={tick} axisLine={false} tickLine={false} className={tickClass} />
                  <Tooltip contentStyle={tooltipStyle} cursor={cursor} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="todo" name="Open" stackId="a" fill="#8C97C4" />
                  <Bar dataKey="review" name="To review" stackId="a" fill="#D9A441" />
                  <Bar dataKey="done" name="Approved" stackId="a" fill="#16A87A" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Progress per project" subtitle="Total tasks and how many are approved">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={projectData} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <XAxis type="number" allowDecimals={false} hide />
                  <YAxis type="category" dataKey="name" width={110} tick={tick} axisLine={false} tickLine={false} className={tickClass} />
                  <Tooltip contentStyle={tooltipStyle} cursor={cursor} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="tasks" name="Tasks" fill="#8C97C4" radius={[0, 6, 6, 0]} barSize={14} />
                  <Bar dataKey="done" name="Approved" fill="#16A87A" radius={[0, 6, 6, 0]} barSize={14} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <ChartCard title="Time logged per project" subtitle="Hours tracked on this team's tasks">
            <ResponsiveContainer width="100%" height={190}>
              <BarChart data={timeData} margin={{ left: -20 }}>
                <XAxis dataKey="name" tick={tick} axisLine={false} tickLine={false} className={tickClass} />
                <YAxis allowDecimals={false} tick={tick} axisLine={false} tickLine={false} unit="h" className={tickClass} />
                <Tooltip contentStyle={tooltipStyle} cursor={cursor} formatter={(v) => [`${v}h`, 'Logged']} />
                <Bar dataKey="hours" radius={[6, 6, 0, 0]} fill="#16A87A" barSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </>
      )}
    </div>
  );
}
