import { useEffect, useRef, useState } from 'react';
import { Trash2, Plus, X, Flag } from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import { useTasks } from '../../context/TaskContext';
import { PROJECT_STATUS_META, PRIORITY_META, todayISO } from '../../data/mockData';
import { useBusy } from '../../hooks/useBusy';
import { usePersistedState } from '../../hooks/usePersistedState';

const emptyForm = { name: '', description: '', status: 'planning', color: 'brand', priority: 'medium', dueDate: '' };
const colorOptions = ['brand', 'coral', 'sage', 'amber'];
const colorDot = { brand: 'bg-brand-500', coral: 'bg-coral-500', sage: 'bg-sage-500', amber: 'bg-amber-500' };

/**
 * Create/edit modal for a project: name, description, status (Planning →
 * Completed), priority, optional deadline, color accent, and inline milestone management —
 * covers the PPT's Project Management + Milestones modules.
 *
 * Pass `groupId` to create a team project (only team admins do this from the Team hub).
 *
 * @param {{ open: boolean, onClose: () => void, project?: import('../../types').Project | null, groupId?: string | null }} props
 */
export default function ProjectModal({ open, onClose, project = null, groupId = null }) {
  const { createProject, updateProject, deleteProject, archiveProject, addMilestone, toggleMilestone, removeMilestone, allProjects } = useTasks();
  // The unsaved form (and the milestone being typed) survive a refresh; personal and team projects keep separate copies.
  const scope = `projectModal.${groupId || 'me'}`;
  const [form, setForm, formRestored] = usePersistedState(`${scope}.form`, emptyForm);
  const [errors, setErrors] = useState({});
  const [milestoneTitle, setMilestoneTitle] = usePersistedState(`${scope}.milestoneTitle`, '');
  const [milestoneDate, setMilestoneDate] = usePersistedState(`${scope}.milestoneDate`, todayISO);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [guard, busy] = useBusy();

  const liveProject = project ? allProjects.find((p) => p.id === project.id) || project : null;

  // Start the form fresh when the dialog opens or switches project, keyed on the project's id (not its object, which is
  // a new copy whenever the workspace refreshes). After a page refresh the form comes back filled in: skip that one reset.
  const latestProject = useRef(project);
  useEffect(() => {
    latestProject.current = project;
  });
  const initKey = open ? (project?.id ?? 'new') : null;
  const restoredFor = useRef(formRestored && open ? initKey : null);
  useEffect(() => {
    if (initKey === null) {
      restoredFor.current = null;
      return;
    }
    if (restoredFor.current === initKey) return;
    const project = latestProject.current;
    if (project) {
      setForm({
        name: project.name,
        description: project.description || '',
        status: project.status || 'planning',
        color: project.color || 'brand',
        priority: project.priority || 'medium',
        dueDate: project.dueDate || '',
      });
    } else {
      setForm(emptyForm);
    }
    setErrors({});
    setConfirmDelete(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the setters are stable; only opening/switching project re-runs this
  }, [initKey]);

  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = 'Project name is required.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (ev) => {
    ev.preventDefault();
    return guard(async () => {
    if (!validate()) return;
    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      status: form.status,
      color: form.color,
      priority: form.priority,
      dueDate: form.dueDate || null,
    };
    const saved = project
      ? await updateProject(project.id, payload)
      : await createProject(groupId ? { ...payload, groupId } : payload);
    if (saved) onClose();
    });
  };

  const handleAddMilestone = (e) => {
    e.preventDefault();
    if (!milestoneTitle.trim() || !project) return;
    addMilestone(project.id, milestoneTitle.trim(), milestoneDate);
    setMilestoneTitle('');
  };

  const inputClass =
    'w-full text-fluid-sm bg-white dark:bg-surface-dark border rounded-lg px-3 py-2 text-ink-900 dark:text-white placeholder:text-ink-500 focus:outline-none';
  const borderFor = (field) => (errors[field] ? 'border-coral-500' : 'border-ink-500/15 dark:border-white/10');
  const labelClass = 'block text-fluid-xs font-medium text-ink-700 dark:text-ink-300 mb-1.5';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={project ? 'Edit project' : 'Create project'}
      size="lg"
      footer={
        <>
          {project && (
            <>
              <Button
                variant="ghost"
                onClick={() => { archiveProject(project.id, !project.archived); onClose(); }}
                className="mr-auto"
              >
                {project.archived ? 'Unarchive' : 'Archive'}
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => guard(async () => {
                  // Deleting a project also deletes all of its tasks, so ask twice.
                  if (!confirmDelete) return setConfirmDelete(true);
                  await deleteProject(project.id);
                  onClose();
                })}
                icon={<Trash2 size={15} />}
                className="!text-coral-600"
              >
                {confirmDelete ? 'Click again — deletes its tasks too' : 'Delete'}
              </Button>
            </>
          )}
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={busy}>{busy ? 'Saving…' : project ? 'Save changes' : 'Create project'}</Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="proj-name" className={labelClass}>Project name</label>
          <input
            id="proj-name"
            className={`${inputClass} ${borderFor('name')}`}
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
            placeholder="e.g. Customer Portal Revamp"
          />
          {errors.name && <p className="text-fluid-xs text-coral-600 mt-1">{errors.name}</p>}
        </div>

        <div>
          <label htmlFor="proj-desc" className={labelClass}>Description</label>
          <textarea
            id="proj-desc"
            rows={2}
            className={`${inputClass} border-ink-500/15 dark:border-white/10 resize-none`}
            value={form.description}
            onChange={(e) => update('description', e.target.value)}
            placeholder="What is this project about?"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="proj-status" className={labelClass}>Status</label>
            <select
              id="proj-status"
              className={`${inputClass} border-ink-500/15 dark:border-white/10`}
              value={form.status}
              onChange={(e) => update('status', e.target.value)}
            >
              {Object.entries(PROJECT_STATUS_META).map(([key, meta]) => (
                <option key={key} value={key}>{meta.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Color</label>
            <div className="flex items-center gap-2 h-[38px]">
              {colorOptions.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => update('color', c)}
                  aria-label={`Use ${c} color`}
                  className={`w-6 h-6 rounded-full ${colorDot[c]} transition-transform ${form.color === c ? 'ring-2 ring-offset-2 ring-ink-900 dark:ring-white dark:ring-offset-surface-darkcard scale-105' : ''}`}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="proj-priority" className={labelClass}>Priority</label>
            <select
              id="proj-priority"
              className={`${inputClass} border-ink-500/15 dark:border-white/10`}
              value={form.priority}
              onChange={(e) => update('priority', e.target.value)}
            >
              {Object.entries(PRIORITY_META).map(([key, meta]) => (
                <option key={key} value={key}>{meta.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="proj-due" className={labelClass}>Deadline (optional)</label>
            <input
              id="proj-due"
              type="date"
              className={`${inputClass} border-ink-500/15 dark:border-white/10`}
              value={form.dueDate}
              onChange={(e) => update('dueDate', e.target.value)}
            />
          </div>
        </div>

        {liveProject && (
          <div className="pt-2 border-t border-ink-500/10 dark:border-white/10">
            <label className={labelClass}>Milestones</label>
            {(liveProject.milestones || []).length > 0 && (
              <ul className="space-y-1.5 mb-2">
                {liveProject.milestones.map((m) => (
                  <li key={m.id} className="flex items-center gap-2.5 group rounded-lg px-2 py-1.5 hover:bg-ink-500/5 dark:hover:bg-white/5">
                    <input
                      type="checkbox"
                      checked={m.done}
                      onChange={() => toggleMilestone(liveProject.id, m.id)}
                      className="w-4 h-4 rounded accent-brand-600 shrink-0"
                    />
                    <Flag size={13} className="text-ink-500 shrink-0" />
                    <span className={`flex-1 min-w-0 truncate text-fluid-sm ${m.done ? 'line-through text-ink-500' : 'text-ink-900 dark:text-white'}`}>
                      {m.title}
                    </span>
                    <span className="text-fluid-xs text-ink-500 shrink-0">
                      {new Date(`${m.date}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeMilestone(liveProject.id, m.id)}
                      className="opacity-0 group-hover:opacity-100 text-ink-500 hover:text-coral-600 transition-opacity shrink-0"
                    >
                      <X size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-col sm:flex-row gap-2 sm:items-stretch">
              <input
                value={milestoneTitle}
                onChange={(e) => setMilestoneTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddMilestone(e)}
                placeholder="Milestone name"
                aria-label="Milestone name"
                className={`${inputClass} border-ink-500/15 dark:border-white/10 sm:flex-1 min-w-0`}
              />
              <input
                type="date"
                value={milestoneDate}
                onChange={(e) => setMilestoneDate(e.target.value)}
                aria-label="Milestone date"
                className={`${inputClass} border-ink-500/15 dark:border-white/10 sm:!w-40 shrink-0`}
              />
              <button
                type="button"
                onClick={handleAddMilestone}
                className="shrink-0 flex items-center justify-center gap-1 text-fluid-xs font-medium bg-brand-600 text-white rounded-lg px-3 py-2 hover:bg-brand-700 transition-colors"
              >
                <Plus size={14} /> Add
              </button>
            </div>
          </div>
        )}
        {!liveProject && (
          <p className="text-fluid-xs text-ink-500 pt-2 border-t border-ink-500/10 dark:border-white/10">
            Save the project first to add milestones.
          </p>
        )}
      </form>
    </Modal>
  );
}
