import { useState } from 'react';
import { Plus, Flag, Bell, ChevronDown, Pencil, Trash2, Check, Clock3, CalendarDays } from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import Badge from '../common/Badge';
import { useTasks } from '../../context/TaskContext';
import { STATUS_META, PRIORITY_META } from '../../data/mockData';

const rail = { task: 'bg-brand-600', reminder: 'bg-sage-500', milestone: 'bg-amber-500' };

function formatMinutes(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** One row on the day sheet: summary line, expandable details, edit + delete. */
function ItemRow({ kind, title, badges, details, onEdit, onDelete, readOnlyNote, children }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const Icon = kind === 'milestone' ? Flag : kind === 'reminder' ? Bell : CalendarDays;
  const editable = Boolean(onEdit || onDelete);

  return (
    <li className="relative rounded-xl border border-ink-500/10 dark:border-white/10 bg-white dark:bg-surface-dark overflow-hidden">
      <span className={`absolute left-0 top-0 bottom-0 w-1 ${rail[kind]}`} aria-hidden="true" />
      <div className="flex items-center gap-2.5 pl-4 pr-2.5 py-2.5">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex items-center gap-2.5 min-w-0 flex-1 text-left"
        >
          <Icon size={15} className="text-ink-500 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block text-fluid-sm font-semibold text-ink-900 dark:text-white truncate">{title}</span>
            <span className="flex flex-wrap items-center gap-1.5 mt-0.5">{badges}</span>
          </span>
          <ChevronDown size={15} className={`text-ink-500 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {confirming ? (
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={onDelete}
              className="inline-flex items-center gap-1 rounded-full bg-coral-500 text-white text-fluid-xs font-semibold px-2.5 py-1 hover:bg-coral-600 transition-colors"
            >
              <Check size={12} /> Delete
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-full text-fluid-xs font-medium px-2.5 py-1 text-ink-700 dark:text-ink-300 hover:bg-ink-500/10 dark:hover:bg-white/10 transition-colors"
            >
              Keep
            </button>
          </div>
        ) : (
          editable && (
            <div className="flex items-center shrink-0">
              {onEdit && (
                <button
                  type="button"
                  onClick={onEdit}
                  aria-label={`Edit ${title}`}
                  title="Edit"
                  className="p-1.5 rounded-md text-ink-500 hover:bg-ink-500/10 dark:hover:bg-white/10 transition-colors"
                >
                  <Pencil size={15} />
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  aria-label={`Delete ${title}`}
                  title="Delete"
                  className="p-1.5 rounded-md text-coral-600 hover:bg-coral-500/10 transition-colors"
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          )
        )}
      </div>

      {open && (
        <div className="pl-4 pr-3.5 pb-3 pt-2 border-t border-ink-500/10 dark:border-white/10 space-y-2 text-fluid-sm text-ink-700 dark:text-ink-300">
          {details}
          {children}
          {readOnlyNote && <p className="text-fluid-xs text-ink-500">{readOnlyNote}</p>}
        </div>
      )}
    </li>
  );
}

function Section({ label, count, children }) {
  if (count === 0) return null;
  return (
    <section>
      <h3 className="text-fluid-xs font-semibold uppercase tracking-wide text-ink-500 mb-2">
        {label} <span className="font-medium normal-case tracking-normal">· {count}</span>
      </h3>
      <ul className="space-y-2">{children}</ul>
    </section>
  );
}

/**
 * The sheet that opens when a calendar date is clicked. Lists everything on
 * that day — tasks, reminders and project milestones — and lets the person
 * view details, edit or delete each task/reminder, or add something new.
 * Team tasks and milestones are view-only here (they're managed in the Team
 * hub / Projects view).
 *
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   dateStr: string | null,
 *   events?: { tasks: object[], milestones: object[], reminders: object[] },
 *   onAdd: () => void,
 *   onEditTask: (task: object) => void,
 *   onEditReminder: (reminder: object) => void,
 *   canAddTasks?: boolean,
 * }} props
 */
export default function DayModal({ open, onClose, dateStr, events, onAdd, onEditTask, onEditReminder, canAddTasks = true }) {
  const { deleteTask, deleteReminder, projects } = useTasks();
  const tasks = events?.tasks ?? [];
  const reminders = events?.reminders ?? [];
  const milestones = events?.milestones ?? [];
  const total = tasks.length + reminders.length + milestones.length;

  const pretty = dateStr
    ? new Date(`${dateStr}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
    : '';
  const projectName = (id) => projects.find((p) => p.id === id)?.name;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={pretty}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Close</Button>
          <Button icon={<Plus size={15} />} onClick={onAdd}>{canAddTasks ? 'Add task or reminder' : 'Add reminder'}</Button>
        </>
      }
    >
      {total === 0 ? (
        <div className="flex flex-col items-center text-center py-8">
          <div className="w-12 h-12 rounded-full bg-brand-500/10 flex items-center justify-center mb-3">
            <CalendarDays size={22} className="text-brand-600" />
          </div>
          <p className="font-display font-semibold text-fluid-base text-ink-900 dark:text-white mb-1">Nothing on this day</p>
          <p className="text-fluid-sm text-ink-500 max-w-xs">{canAddTasks ? 'Add a task or reminder to plan it onto this date.' : 'Add a reminder to plan it onto this date.'}</p>
        </div>
      ) : (
        <div className="space-y-5">
          <Section label="Tasks" count={tasks.length}>
            {tasks.map((t) => {
              const isTeam = Boolean(t.groupId);
              const logged = (t.timeEntries || []).reduce((sum, e) => sum + e.minutes, 0);
              const subDone = (t.subtasks || []).filter((s) => s.done).length;
              return (
                <ItemRow
                  key={t.id}
                  kind="task"
                  title={t.title}
                  onEdit={isTeam ? undefined : () => onEditTask(t)}
                  onDelete={isTeam ? undefined : () => deleteTask(t.id)}
                  readOnlyNote={isTeam ? 'Team task — manage it from the Team hub.' : undefined}
                  badges={
                    <>
                      <Badge tone={PRIORITY_META[t.priority].color}>{PRIORITY_META[t.priority].label}</Badge>
                      <Badge tone={t.status === 'done' ? 'sage' : 'neutral'}>{STATUS_META[t.status]?.label}</Badge>
                      {isTeam && <Badge tone="brand">Team</Badge>}
                    </>
                  }
                  details={
                    <>
                      <p className={t.description ? '' : 'text-ink-500 italic'}>{t.description || 'No description.'}</p>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-fluid-xs text-ink-500">
                        {projectName(t.projectId) && <span>Project: {projectName(t.projectId)}</span>}
                        {t.subtasks?.length > 0 && <span>{subDone}/{t.subtasks.length} subtasks done</span>}
                        {logged > 0 && (
                          <span className="inline-flex items-center gap-1"><Clock3 size={11} /> {formatMinutes(logged)} logged</span>
                        )}
                      </div>
                      {t.tags?.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {t.tags.map((tag) => (
                            <span key={tag} className="text-fluid-xs text-brand-600 dark:text-brand-300 bg-brand-500/10 rounded px-1.5 py-0.5">
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </>
                  }
                />
              );
            })}
          </Section>

          <Section label="Reminders" count={reminders.length}>
            {reminders.map((r) => (
              <ItemRow
                key={r.id}
                kind="reminder"
                title={r.title}
                onEdit={() => onEditReminder(r)}
                onDelete={() => deleteReminder(r.id)}
                badges={r.time ? <Badge tone="sage"><Clock3 size={11} /> {r.time}</Badge> : <Badge>All day</Badge>}
                details={<p className={r.note ? '' : 'text-ink-500 italic'}>{r.note || 'No note.'}</p>}
              />
            ))}
          </Section>

          <Section label="Milestones" count={milestones.length}>
            {milestones.map((m) => (
              <ItemRow
                key={m.id}
                kind="milestone"
                title={m.title}
                badges={
                  <>
                    <Badge tone="amber">{m.projectName}</Badge>
                    {m.done && <Badge tone="sage">Done</Badge>}
                  </>
                }
                details={<p>Project milestone for {m.projectName}.</p>}
                readOnlyNote="Edit milestones from the project in My Workspace."
              />
            ))}
          </Section>
        </div>
      )}
    </Modal>
  );
}
