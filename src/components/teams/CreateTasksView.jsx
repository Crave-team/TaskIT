import { useState } from 'react';
import { usePersistedState } from '../../hooks/usePersistedState';
import { useBusy } from '../../hooks/useBusy';
import { Plus, Trash2, CheckCircle2, Shuffle } from 'lucide-react';
import Button from '../common/Button';
import { useTasks } from '../../context/TaskContext';
import { toISODate } from '../../utils/date';
import { panelClass } from './shared';

let rowSeq = 1;
const newRow = () => {
  const due = new Date();
  due.setDate(due.getDate() + 7);
  return { id: `${Date.now().toString(36)}-${rowSeq++}`, title: '', roleId: '', tags: '', priority: 'medium', dueDate: toISODate(due) };
};

const fieldClass =
  'w-full rounded-lg border border-ink-500/15 dark:border-white/10 bg-white dark:bg-surface-dark px-3 text-fluid-sm text-ink-900 dark:text-white placeholder:text-ink-500 focus:outline-none';
/** Comma/space separated tag text -> clean tag list. */
const parseTagInput = (text) => [...new Set(String(text || '').split(/[,\s]+/).map((t) => t.trim().replace(/^#/, '').toLowerCase()).filter(Boolean))];

const GRID = 'md:grid-cols-[minmax(0,1fr)_8rem_6.5rem_11rem_9.5rem_2.25rem]';

/**
 * Build a list of tasks, choose the role each one is for, and create them in one go. The SERVER picks the person:
 * a member among those who hold the task's role, splitting each batch evenly (see `createTeamTasks`). This form only collects the rows
 * and shows who got what afterwards. Every task needs a role.
 */
export default function CreateTasksView({ group, project, members }) {
  const { createTeamTasks } = useTasks();
  const [rows, setRows] = usePersistedState(`assign.${project.id}.rows`, () => [newRow(), newRow()]);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [guard, busy] = useBusy();

  const roles = group.roles || [];
  const holdersOf = (roleId) => members.filter((m) => group.memberRoles?.[m.id] === roleId).length;
  const update = (id, patch) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const submit = (e) => {
    e.preventDefault();
    return guard(() => assign());
  };

  const assign = async () => {
    const filled = rows.filter((r) => r.title.trim());
    if (filled.length === 0) {
      setError('Add at least one task title.');
      return;
    }
    const missing = filled.findIndex((r) => !r.roleId);
    if (missing !== -1) {
      setError(`Choose a role for “${filled[missing].title.trim()}”.`);
      return;
    }
    setError('');
    const created = await createTeamTasks(
      project.id,
      filled.map((r) => ({ title: r.title.trim(), dueDate: r.dueDate, tags: parseTagInput(r.tags), priority: r.priority, roleId: r.roleId })),
    );
    if (!created) return; // the server refused (for instance a role nobody holds); the app already showed why, and the rows are kept

    const nameOf = Object.fromEntries(members.map((m) => [m.id, m.name]));
    const summary = {};
    const decisions = created.map(({ task, decision }) => ({ title: task.title, name: nameOf[task.assigneeId] || 'Unknown', roleName: decision.roleName }));
    decisions.forEach((d) => { summary[d.name] = (summary[d.name] || 0) + 1; });
    setResult({ total: decisions.length, decisions, summary });
    setRows([newRow(), newRow()]);
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className={`${panelClass} p-4 space-y-3`}>
        <div>
          <p className="text-fluid-sm font-semibold text-ink-900 dark:text-white">Create & assign tasks</p>
          <p className="text-fluid-xs text-ink-500">
            Choose the role each task is for. The server shares them evenly among the members who hold that role; any leftover goes to randomly chosen people.
          </p>
          {roles.length === 0 && (
            <p className="text-fluid-xs text-amber-700 dark:text-amber-300 mt-1.5" role="alert">This team has no roles yet. Add roles in the Members tab before creating tasks.</p>
          )}
        </div>

        <div className={`hidden md:grid ${GRID} gap-2 px-0.5 text-fluid-xs font-medium text-ink-500`}>
          <span>Task</span><span>Tags</span><span>Priority</span><span>Role</span><span>Due date</span><span />
        </div>

        <ul className="space-y-2">
          {rows.map((r, i) => {
            return (
              <li key={r.id}>
                <div className={`grid grid-cols-1 ${GRID} gap-2 items-center`}>
                  <input
                    value={r.title}
                    onChange={(e) => update(r.id, { title: e.target.value })}
                    placeholder={`Task ${i + 1}`}
                    aria-label={`Task ${i + 1} title`}
                    className={`${fieldClass} h-10`}
                  />
                  <input
                    value={r.tags ?? ''}
                    onChange={(e) => update(r.id, { tags: e.target.value })}
                    placeholder="Tags, e.g. frontend"
                    aria-label={`Task ${i + 1} tags`}
                    className={`${fieldClass} h-10`}
                  />
                  <select value={r.priority ?? 'medium'} onChange={(e) => update(r.id, { priority: e.target.value })} aria-label={`Task ${i + 1} priority`} className={fieldClass}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                  <select value={r.roleId} onChange={(e) => update(r.id, { roleId: e.target.value })} aria-label={`Task ${i + 1} role`} className={fieldClass}>
                    <option value="">Choose a role</option>
                    {roles.map((role) => {
                      const n = holdersOf(role.id);
                      return <option key={role.id} value={role.id} disabled={n === 0}>{role.name} ({n === 0 ? 'nobody' : n})</option>;
                    })}
                  </select>
                  <input type="date" value={r.dueDate} onChange={(e) => update(r.id, { dueDate: e.target.value })} aria-label={`Task ${i + 1} due date`} className={fieldClass} />
                  <button
                    type="button"
                    onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.id !== r.id) : rs))}
                    disabled={rows.length === 1}
                    aria-label={`Remove task ${i + 1}`}
                    className="p-2 rounded-lg text-ink-500 hover:text-coral-600 hover:bg-coral-500/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors justify-self-end"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        {error && <p role="alert" className="text-fluid-xs text-coral-600">{error}</p>}

        <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
          <Button type="button" variant="ghost" size="sm" icon={<Plus size={13} />} onClick={() => setRows((rs) => [...rs, newRow()])}>
            Add another task
          </Button>
          <Button type="submit" disabled={busy || roles.length === 0}>{busy ? 'Assigning…' : 'Assign tasks'}</Button>
        </div>
      </div>

      {result && (
        <div className="rounded-xl bg-brand-500/10 p-4 space-y-2.5" role="status">
          <p className="flex items-center gap-2 text-fluid-sm font-semibold text-brand-700 dark:text-brand-300">
            <CheckCircle2 size={16} /> {result.total} task{result.total === 1 ? '' : 's'} assigned
          </p>
          <ul className="space-y-1" aria-label="Who got each task">
            {result.decisions.map((d) => (
              <li key={d.title} className="rounded-lg bg-surface-card dark:bg-white/5 px-3 py-1.5 text-fluid-xs">
                <span className="font-medium text-ink-900 dark:text-white">{d.title}</span>
                <span className="text-ink-500"> → </span>
                <span className="font-medium text-ink-900 dark:text-white">{d.name}</span>
                <span className="text-ink-500"> — {d.roleName}</span>
              </li>
            ))}
          </ul>
          <ul className="grid sm:grid-cols-2 gap-1.5">
            {Object.entries(result.summary).map(([name, count]) => (
              <li key={name} className="flex items-center justify-between gap-2 rounded-lg bg-surface-card dark:bg-white/5 px-3 py-1.5 text-fluid-xs">
                <span className="font-medium text-ink-900 dark:text-white truncate">{name}</span>
                <span className="inline-flex items-center gap-1 text-ink-500 shrink-0"><Shuffle size={11} /> {count}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </form>
  );
}
