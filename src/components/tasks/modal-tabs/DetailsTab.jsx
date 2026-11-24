import { usePersistedState } from '../../../hooks/usePersistedState';
import { X, Tag } from 'lucide-react';
import { STATUS_META, PRIORITY_META, RECURRENCE_META } from '../../../data/mockData';

/**
 * Core task fields: title, description, priority/status, due date, project,
 * tags/labels and recurrence. The bulk of the
 * original create/edit form, extracted into its own tab.
 *
 * @param {{
 *   form: object,
 *   errors: object,
 *   update: (key: string, value: any) => void,
 *   projects: import('../../../types').Project[],
 * }} props
 */
export default function DetailsTab({ form, errors, update, projects }) {
  const inputClass =
    'w-full text-fluid-sm bg-white dark:bg-surface-dark border rounded-lg px-3 py-2 text-ink-900 dark:text-white placeholder:text-ink-500 focus:outline-none';
  const borderFor = (field) =>
    errors[field] ? 'border-coral-500' : 'border-ink-500/15 dark:border-white/10';
  const labelClass = 'block text-fluid-xs font-medium text-ink-700 dark:text-ink-300 mb-1.5';

  const currentTags = form.tags
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  const [tagDraft, setTagDraft] = usePersistedState('taskEditor.tagDraft', '');

  /** Adds one or more labels (comma-separated input is split), skipping duplicates. */
  const addTags = (raw) => {
    const incoming = raw.split(',').map((t) => t.trim()).filter(Boolean);
    if (incoming.length === 0) return;
    const next = [...currentTags];
    incoming.forEach((t) => {
      if (!next.some((x) => x.toLowerCase() === t.toLowerCase())) next.push(t);
    });
    update('tags', next.join(', '));
  };

  const removeTag = (tag) => update('tags', currentTags.filter((t) => t !== tag).join(', '));

  const handleTagKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTags(tagDraft);
      setTagDraft('');
    } else if (e.key === 'Backspace' && tagDraft === '' && currentTags.length > 0) {
      removeTag(currentTags[currentTags.length - 1]);
    }
  };

  const commitTagDraft = () => {
    addTags(tagDraft);
    setTagDraft('');
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="title" className={labelClass}>Title</label>
        <input
          id="title"
          className={`${inputClass} ${borderFor('title')}`}
          value={form.title}
          onChange={(e) => update('title', e.target.value)}
          placeholder="e.g. Design onboarding empty state"
        />
        {errors.title && <p className="text-fluid-xs text-coral-600 mt-1">{errors.title}</p>}
      </div>

      <div>
        <label htmlFor="description" className={labelClass}>Description</label>
        <textarea
          id="description"
          rows={3}
          className={`${inputClass} ${borderFor('description')} resize-none`}
          value={form.description}
          onChange={(e) => update('description', e.target.value)}
          placeholder="Add any useful context or acceptance criteria…"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="priority" className={labelClass}>Priority</label>
          <select
            id="priority"
            className={`${inputClass} ${borderFor('priority')}`}
            value={form.priority}
            onChange={(e) => update('priority', e.target.value)}
          >
            {Object.entries(PRIORITY_META).map(([key, meta]) => (
              <option key={key} value={key}>{meta.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="status" className={labelClass}>Status</label>
          <select
            id="status"
            className={`${inputClass} ${borderFor('status')}`}
            value={form.status}
            onChange={(e) => update('status', e.target.value)}
          >
            {Object.entries(STATUS_META).map(([key, meta]) => (
              <option key={key} value={key}>{meta.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="dueDate" className={labelClass}>Due date</label>
          <input
            id="dueDate"
            type="date"
            className={`${inputClass} ${borderFor('dueDate')}`}
            value={form.dueDate}
            onChange={(e) => update('dueDate', e.target.value)}
          />
          {errors.dueDate && <p className="text-fluid-xs text-coral-600 mt-1">{errors.dueDate}</p>}
        </div>
        <div>
          <label htmlFor="project" className={labelClass}>Project</label>
          <select
            id="project"
            className={`${inputClass} ${borderFor('projectId')}`}
            value={form.projectId}
            onChange={(e) => update('projectId', e.target.value)}
          >
            <option value="" disabled>{projects.length ? 'Select project' : 'No projects yet'}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          {errors.projectId && (
            <p className="text-fluid-xs text-coral-600 mt-1">
              {projects.length ? errors.projectId : 'Create a project first, then add tasks to it.'}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="recurrence" className={labelClass}>Repeat</label>
          <select
            id="recurrence"
            className={inputClass + ' border-ink-500/15 dark:border-white/10'}
            value={form.recurrence}
            onChange={(e) => update('recurrence', e.target.value)}
          >
            {Object.entries(RECURRENCE_META).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="tags" className={labelClass}>Labels &amp; tags</label>
        <div className="flex flex-wrap items-center gap-1.5 w-full bg-white dark:bg-surface-dark border border-ink-500/15 dark:border-white/10 rounded-lg px-2.5 py-1.5 min-h-[2.5rem] focus-within:border-brand-600/60 focus-within:shadow-[0_0_0_3px_rgba(34,201,144,0.16)] transition-[border-color,box-shadow]">
          <Tag size={14} className="text-ink-500 shrink-0" aria-hidden="true" />
          {currentTags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full bg-brand-500/10 text-brand-700 dark:text-brand-300 text-fluid-xs font-medium pl-2.5 pr-1 py-0.5"
            >
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                aria-label={`Remove label ${tag}`}
                className="rounded-full p-0.5 hover:bg-brand-500/20 transition-colors"
              >
                <X size={11} />
              </button>
            </span>
          ))}
          <input
            id="tags"
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={handleTagKeyDown}
            onBlur={commitTagDraft}
            placeholder={currentTags.length === 0 ? 'Type a label and press Enter' : 'Add another…'}
            className="flex-1 min-w-[120px] bg-transparent text-fluid-sm text-ink-900 dark:text-white placeholder:text-ink-500 !border-0 !shadow-none !outline-none !min-h-0 px-1 py-1"
          />
        </div>
        <p className="text-fluid-xs text-ink-500 mt-1">Create your own labels — press Enter or comma after each one.</p>
      </div>
    </div>
  );
}
