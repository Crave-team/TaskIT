import {
  Plus, LayoutGrid, GanttChartSquare, ChevronLeft, ChevronRight, CalendarDays, List, Flag, Bell, Megaphone,
  Hash, Globe2, FileText, ListTodo, MessageSquare, Paperclip, Clock3, Play, Send, Trash2,
} from 'lucide-react';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Legend, ResponsiveContainer,
} from 'recharts';
import AppWindow, { ScaleToFit } from './preview/AppWindow';
import { SAMPLE_TASKS, SAMPLE_PROJECTS, progressOf, tasksWithStatus } from './preview/sample';
import { TaskCardView } from '../tasks/TaskCard';
import { ProjectCardView } from '../projects/ProjectCard';
import GanttChart from '../projects/GanttChart';
import Badge from '../common/Badge';
import Button from '../common/Button';
import Tabs from '../common/Tabs';
import ProgressBar from '../common/ProgressBar';
import { TeamIcon, Avatar as TeamAvatar, panelClass } from '../teams/shared';
import { STATUS_META, toLocalISODate } from '../../data/mockData';
import { DEMO_REMINDERS, DEMO_ANNOUNCEMENTS } from '../../data/demoData';

const W = 1000;
const H = 640;
const Canvas = ({ children }) => (
  <ScaleToFit designWidth={W} designHeight={H}>{children}</ScaleToFit>
);

/** Segmented toggle exactly like the one the Workspace / Calendar pages use. */
function Segmented({ items }) {
  return (
    <div className="flex items-center bg-white dark:bg-surface-darkcard border border-ink-500/15 dark:border-white/10 shadow-soft rounded-lg p-1">
      {items.map(({ label, icon: Icon, on }) => (
        <span
          key={label}
          className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-fluid-xs font-medium ${on ? 'bg-brand-700 text-white' : 'text-ink-500'}`}
        >
          <Icon size={15} /> {label}
        </span>
      ))}
    </div>
  );
}

/* 1 — Tasks & Kanban: all FOUR statuses, same as the real board ------------ */
const KANBAN_PICKS = { todo: 2, 'in-progress': 2, review: 2, done: 1 };

export function KanbanVisual() {
  return (
    <Canvas>
      <AppWindow title="Task Workspace" active="tasks" pageTitle="Product Launch" subtitle="7 tasks in this project"
        action={<Button icon={<Plus size={16} />}>New task</Button>}>
        <div className="flex items-center justify-between mb-4">
          <Segmented items={[{ label: 'Board', icon: LayoutGrid, on: true }, { label: 'List', icon: List }]} />
          <span className="inline-flex items-center gap-2 text-fluid-xs text-ink-500">
            <span className="w-2.5 h-2.5 rounded-full bg-brand-500" /> Product Launch
          </span>
        </div>
        <div className="flex gap-3">
          {Object.entries(STATUS_META).map(([key, meta]) => {
            const list = tasksWithStatus(key, KANBAN_PICKS[key]);
            return (
              <div key={key} className="flex flex-col flex-1 min-w-0 rounded-xl p-2.5 border bg-ink-500/[0.04] border-ink-500/[0.06] dark:bg-transparent dark:border-transparent">
                <div className="flex items-center justify-between px-1 mb-3">
                  <div className="flex items-center gap-2">
                    <h3 className="font-display font-semibold text-fluid-sm text-ink-900 dark:text-white">{meta.label}</h3>
                    <span className="text-fluid-xs text-ink-500 bg-ink-500/10 rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
                      {SAMPLE_TASKS.filter((t) => t.status === key).length}
                    </span>
                  </div>
                  <span className="p-1 text-ink-500"><Plus size={16} /></span>
                </div>
                <div className="space-y-2.5">
                  {list.map((t) => <TaskCardView key={t.id} task={t} progress={progressOf(t)} blockedByCount={0} />)}
                </div>
              </div>
            );
          })}
        </div>
      </AppWindow>
    </Canvas>
  );
}

/* 2 — Projects & timeline --------------------------------------------------- */
export function ProjectsVisual() {
  const projects = SAMPLE_PROJECTS.slice(0, 3);
  const ganttTasks = ['high', 'medium', 'low']
    .map((p) => SAMPLE_TASKS.find((t) => t.priority === p && t.status !== 'done'))
    .filter(Boolean);
  return (
    <Canvas>
      <AppWindow title="Task Workspace" active="tasks" pageTitle="Task Workspace" subtitle="Pick a project to see its tasks"
        action={<Button icon={<Plus size={16} />}>New project</Button>}>
        <div className="flex items-center justify-between mb-4">
          <Segmented items={[{ label: 'Grid', icon: LayoutGrid, on: true }, { label: 'Timeline', icon: GanttChartSquare }]} />
        </div>
        <div className="grid grid-cols-3 gap-4 mb-4">
          {projects.map((p) => {
            const mine = SAMPLE_TASKS.filter((t) => t.projectId === p.id);
            const done = mine.filter((t) => t.status === 'done').length;
            return (
              <ProjectCardView
                key={p.id}
                project={p}
                taskCount={mine.length}
                progress={mine.length ? Math.round((done / mine.length) * 100) : 0}
                canEdit={false}
              />
            );
          })}
        </div>
        <GanttChart tasks={ganttTasks} />
      </AppWindow>
    </Canvas>
  );
}

/* 3 — Calendar --------------------------------------------------------------- */
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const priorityDot = { low: 'bg-sage-500', medium: 'bg-amber-500', high: 'bg-coral-500' };

export function CalendarVisual() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const todayStr = toLocalISODate(now);
  const first = new Date(year, month, 1);
  const cells = [];
  for (let i = 0; i < first.getDay(); i++) cells.push(null);
  for (let d = 1; d <= new Date(year, month + 1, 0).getDate(); d++) cells.push(new Date(year, month, d));

  const by = {};
  const ensure = (k) => (by[k] ||= { tasks: [], milestones: [], reminders: [], announcements: [] });
  SAMPLE_TASKS.forEach((t) => ensure(t.dueDate).tasks.push(t));
  SAMPLE_PROJECTS.forEach((p) => (p.milestones || []).forEach((m) => ensure(m.date).milestones.push(m)));
  DEMO_REMINDERS.forEach((r) => r.date && ensure(r.date).reminders.push(r));
  DEMO_ANNOUNCEMENTS.forEach((a) => ensure((a.createdAt || '').slice(0, 10)).announcements.push(a));

  return (
    <Canvas>
      <AppWindow title="Calendar" active="calendar" pageTitle="Calendar" subtitle="Deadlines and milestones by day, week, or month">
        <div className="flex items-center justify-between mb-4">
          <Segmented items={[{ label: 'Month', icon: CalendarDays, on: true }, { label: 'Agenda (next 2 weeks)', icon: List }]} />
          <div className="flex items-center gap-2">
            <span className="p-1.5 text-ink-500"><ChevronLeft size={17} /></span>
            <span className="font-display font-semibold text-fluid-sm text-ink-900 dark:text-white w-32 text-center">
              {first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
            </span>
            <span className="p-1.5 text-ink-500"><ChevronRight size={17} /></span>
            <Button variant="secondary" size="sm">Today</Button>
          </div>
        </div>
        <div className="bg-surface-card dark:bg-surface-darkcard border border-ink-500/10 dark:border-white/10 shadow-soft rounded-xl overflow-hidden">
          <div className="grid grid-cols-7 border-b border-ink-500/10 dark:border-white/10">
            {WEEKDAYS.map((w) => (
              <div key={w} className="px-2 py-2 text-center text-fluid-xs font-semibold text-ink-500 uppercase tracking-wide">{w}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((date, i) => {
              if (!date) return <div key={`e${i}`} className="h-[78px] border-b border-r border-ink-500/8 dark:border-white/8" />;
              const key = toLocalISODate(date);
              const ev = by[key];
              const isToday = key === todayStr;
              return (
                <div key={key} className="h-[78px] overflow-hidden border-b border-r border-ink-500/8 dark:border-white/8 p-1.5 text-left">
                  <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-fluid-xs font-medium ${isToday ? 'bg-brand-700 text-white' : 'text-ink-700 dark:text-ink-300'}`}>
                    {date.getDate()}
                  </span>
                  <div className="mt-0.5 space-y-0.5">
                    {ev?.milestones.slice(0, 1).map((m) => (
                      <div key={m.id} className="flex items-center gap-1 text-fluid-xs text-amber-600 truncate"><Flag size={10} className="shrink-0" /> {m.title}</div>
                    ))}
                    {ev?.reminders.slice(0, 1).map((r) => (
                      <div key={r.id} className="flex items-center gap-1 text-fluid-xs text-sage-600 truncate"><Bell size={10} className="shrink-0" /> {r.title}</div>
                    ))}
                    {ev?.announcements.slice(0, 1).map((a) => (
                      <div key={a.id} className="flex items-center gap-1 text-fluid-xs text-brand-600 dark:text-brand-300 truncate"><Megaphone size={10} className="shrink-0" /> {a.text}</div>
                    ))}
                    {ev?.tasks.slice(0, 1).map((t) => (
                      <div key={t.id} className="text-fluid-xs truncate text-ink-700 dark:text-ink-300 flex items-center gap-1">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${priorityDot[t.priority]}`} /> {t.title}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </AppWindow>
    </Canvas>
  );
}

/* 4 — Team workspace ---------------------------------------------------------- */
function Bubble({ mine, first = true, last = true, name, id, children }) {
  const radius = mine
    ? `rounded-2xl ${first ? '' : 'rounded-tr-md'} ${last ? '' : 'rounded-br-md'}`
    : `rounded-2xl ${first ? '' : 'rounded-tl-md'} ${last ? '' : 'rounded-bl-md'}`;
  return (
    <div className={`flex items-end gap-2 ${mine ? 'justify-end' : 'justify-start'} ${first ? 'mt-3' : 'mt-0.5'}`}>
      {!mine && <div className="w-7 shrink-0">{last && <TeamAvatar id={id} name={name} size="sm" />}</div>}
      <div className={`flex flex-col min-w-0 max-w-[65%] ${mine ? 'items-end' : 'items-start'}`}>
        {first && !mine && <span className="text-fluid-xs text-ink-500 ml-3 mb-0.5">{name}</span>}
        <div className={`${radius} ${mine ? 'bg-brand-700 text-white' : 'bg-ink-500/10 dark:bg-white/10 text-ink-900 dark:text-white'} px-3.5 py-2 text-fluid-sm`}>
          {children}
        </div>
      </div>
    </div>
  );
}

export function TeamsVisual() {
  const tabs = [
    { key: 'chat', label: 'Chat', icon: MessageSquare, count: 4 },
    { key: 'projects', label: 'Projects', icon: GanttChartSquare, count: 1 },
    { key: 'announcements', label: 'Announcements', icon: Megaphone, count: 1 },
    { key: 'assign', label: 'Assign task', icon: ListTodo },
    { key: 'members', label: 'Members', icon: CalendarDays, count: 4 },
  ];
  return (
    <Canvas>
      <AppWindow title="Team" active="team" pageTitle="Team" subtitle="Your teams, chats and shared projects">
        <div className={`${panelClass} p-4 mb-3`}>
          <div className="flex items-center gap-3">
            <TeamIcon id="grp-1" name="Product Launch Squad" />
            <div className="min-w-0 flex-1">
              <h2 className="font-display font-bold text-fluid-lg text-ink-900 dark:text-white truncate">Product Launch Squad</h2>
              <p className="text-fluid-xs text-ink-500 truncate">Cross-functional crew coordinating the Q4 product launch end to end.</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge tone="brand"><Globe2 size={11} /> Public</Badge>
              <Badge tone="amber">Owner</Badge>
            </div>
          </div>
          <div className="mt-3 -mb-1"><Tabs tabs={tabs} active="chat" onChange={() => {}} /></div>
        </div>

        <div className={`${panelClass} p-4`}>
          <div className="flex flex-wrap items-center gap-2 mb-1">
            {['General', 'Launch plan', 'Design'].map((c, i) => (
              <span
                key={c}
                className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-fluid-xs font-medium ${
                  i === 1 ? 'bg-brand-700 text-white' : 'bg-ink-500/8 dark:bg-white/8 text-ink-700 dark:text-ink-300'
                }`}
              >
                <Hash size={13} /> {c}
              </span>
            ))}
          </div>
          <Bubble id="acct-3" name="Maya Chen">Press embargo lifts next week. Can everyone confirm their deliverables by Friday?</Bubble>
          <Bubble id="acct-5" name="Priya Nair" last={false}>Design assets are ready for review.</Bubble>
          <Bubble id="acct-5" name="Priya Nair" first={false}>
            <span className="font-semibold rounded px-1 text-brand-700 dark:text-brand-300 bg-brand-500/15">@Alex Rivera</span> can you take a look?
          </Bubble>
          <Bubble mine>On it — I'll review them this afternoon and assign the QA task. 👍</Bubble>
          <div className="mt-4 flex items-center gap-2">
            <div className="flex-1 text-fluid-sm bg-white dark:bg-surface-dark border border-ink-500/15 dark:border-white/10 rounded-full px-4 py-2 text-ink-500">Message #Launch plan…</div>
            <span className="w-9 h-9 rounded-full bg-brand-700 text-white flex items-center justify-center"><Send size={15} /></span>
          </div>
        </div>
      </AppWindow>
    </Canvas>
  );
}

/* 5 — Reports (the real Recharts charts + stat cards) ------------------------- */
const statusColor = { todo: '#6B7280', 'in-progress': '#8C97C4', review: '#D9A441', done: '#16A87A' };

function ChartCard({ title, subtitle, children }) {
  return (
    <div className="bg-surface-card dark:bg-surface-darkcard border border-ink-500/10 dark:border-white/10 rounded-xl p-5 shadow-soft">
      <h3 className="font-display font-semibold text-fluid-lg text-ink-900 dark:text-white mb-1">{title}</h3>
      <p className="text-fluid-xs text-ink-500 mb-3">{subtitle}</p>
      {children}
    </div>
  );
}

export function ReportsVisual() {
  const total = SAMPLE_TASKS.length;
  const done = SAMPLE_TASKS.filter((t) => t.status === 'done').length;
  const statusData = Object.entries(STATUS_META).map(([key, m]) => ({ key, name: m.label, value: SAMPLE_TASKS.filter((t) => t.status === key).length }));
  const names = [...new Set(SAMPLE_TASKS.map((t) => t.assignee))].slice(0, 5);
  const workload = names.map((n) => ({
    name: n.split(' ')[0],
    open: SAMPLE_TASKS.filter((t) => t.assignee === n && t.status !== 'done').length,
    done: SAMPLE_TASKS.filter((t) => t.assignee === n && t.status === 'done').length,
  }));
  const tick = { fill: 'currentColor', fontSize: 12 };
  const stat = 'bg-surface-card dark:bg-surface-darkcard border border-ink-500/10 dark:border-white/10 rounded-xl p-4 shadow-soft';
  return (
    <Canvas>
      <AppWindow title="Team" active="team" pageTitle="Launch plan · Reports" subtitle="How work is distributed and progressing in this team">
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className={stat}><p className="text-fluid-sm text-ink-500">Overall completion</p><p className="font-display font-bold text-fluid-3xl text-ink-900 dark:text-white">{Math.round((done / total) * 100)}%</p></div>
          <div className={stat}><p className="text-fluid-sm text-ink-500">Active projects</p><p className="font-display font-bold text-fluid-3xl text-ink-900 dark:text-white">{SAMPLE_PROJECTS.length}</p></div>
          <div className={stat}><p className="text-fluid-sm text-ink-500">Total tasks tracked</p><p className="font-display font-bold text-fluid-3xl text-ink-900 dark:text-white">{total}</p></div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <ChartCard title="Tasks by status" subtitle="Distribution across the workflow">
            <ResponsiveContainer width="100%" height={190}>
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={42} outerRadius={68} paddingAngle={2} isAnimationActive={false}>
                  {statusData.map((d) => <Cell key={d.key} fill={statusColor[d.key]} />)}
                </Pie>
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Team workload" subtitle="Open vs. completed tasks per person">
            <ResponsiveContainer width="100%" height={190}>
              <BarChart data={workload} margin={{ left: -20 }}>
                <XAxis dataKey="name" tick={tick} axisLine={false} tickLine={false} className="text-ink-700 dark:text-ink-300" />
                <YAxis allowDecimals={false} tick={tick} axisLine={false} tickLine={false} className="text-ink-700 dark:text-ink-300" />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="open" name="Open" stackId="a" fill="#D9A441" isAnimationActive={false} />
                <Bar dataKey="done" name="Completed" stackId="a" fill="#4E8D7C" radius={[6, 6, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </AppWindow>
    </Canvas>
  );
}

/* 6 — Task detail: the real Time tab inside the real task dialog -------------- */
export function TrackingVisual() {
  const task = SAMPLE_TASKS.find((t) => t.status === 'in-progress') || SAMPLE_TASKS[0];
  const logged = (task.timeEntries || []).reduce((s, e) => s + e.minutes, 0);
  const est = task.estimatedMinutes || 240;
  const tabs = [
    { key: 'details', label: 'Details', icon: FileText },
    { key: 'subtasks', label: 'Subtasks', icon: ListTodo, count: task.subtasks?.length },
    { key: 'files', label: 'Files', icon: Paperclip, count: task.attachments?.length },
    { key: 'time', label: 'Time', icon: Clock3 },
  ];
  const fmt = (m) => `${Math.floor(m / 60)}h ${m % 60}m`;
  return (
    <Canvas>
      <AppWindow title="Task Workspace" active="tasks" pageTitle="Product Launch" subtitle="7 tasks in this project">
        <div className="relative">
          {/* the board, dimmed behind the dialog */}
          <div className="flex gap-3 opacity-60">
            {['todo', 'in-progress', 'review', 'done'].map((k) => (
              <div key={k} className="flex-1 space-y-2.5">
                {tasksWithStatus(k, 1).map((t) => <TaskCardView key={t.id} task={t} progress={progressOf(t)} />)}
              </div>
            ))}
          </div>
          <div className="absolute -inset-x-6 -top-5 -bottom-[400px] bg-ink-900/50" />

          <div className="absolute left-1/2 -translate-x-1/2 -top-2 w-[560px] rounded-2xl bg-surface-card dark:bg-surface-darkcard shadow-elevated border border-ink-500/10 dark:border-white/10">
            <div className="flex items-center justify-between px-6 py-3.5 border-b border-ink-500/10 dark:border-white/10">
              <h2 className="font-display font-semibold text-fluid-lg text-ink-900 dark:text-white">Edit task</h2>
              <span className="p-1.5 text-ink-500"><Trash2 size={17} /></span>
            </div>
            <div className="px-6 pt-3 pb-5 space-y-4">
              <Tabs tabs={tabs} active="time" onChange={() => {}} />
              <div className="flex items-center justify-between bg-ink-500/5 dark:bg-white/5 rounded-xl px-4 py-3">
                <div>
                  <p className="text-fluid-xs text-ink-500">Session timer</p>
                  <p className="font-display font-bold text-fluid-xl text-ink-900 dark:text-white tabular-nums">00:42:17</p>
                </div>
                <span className="flex items-center gap-1.5 text-fluid-sm font-medium bg-brand-600 text-white rounded-lg px-3.5 py-2">
                  <Play size={14} /> Start
                </span>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-fluid-xs font-medium text-ink-700 dark:text-ink-300">{fmt(logged)} logged of {fmt(est)} estimated</span>
                </div>
                <ProgressBar value={Math.round((logged / est) * 100)} size="md" />
              </div>
              <ul className="space-y-1.5">
                {(task.timeEntries || []).map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-2 text-fluid-sm px-1">
                    <span className="flex items-center gap-2 min-w-0"><Clock3 size={13} className="text-ink-500 shrink-0" /><span className="text-ink-700 dark:text-ink-300 truncate">{e.note}</span></span>
                    <span className="font-medium text-ink-900 dark:text-white">{fmt(e.minutes)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </AppWindow>
    </Canvas>
  );
}
