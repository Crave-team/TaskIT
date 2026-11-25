import { useEffect, useRef, useState } from 'react';
import { Trash2, FileText, ListTodo, Paperclip, Clock3, Timer } from 'lucide-react';
import Button from '../common/Button';
import Tabs from '../common/Tabs';
import DetailsTab from './modal-tabs/DetailsTab';
import SubtasksTab from './modal-tabs/SubtasksTab';
import FilesTab from './modal-tabs/FilesTab';
import TimeTab from './modal-tabs/TimeTab';
import { useTasks } from '../../context/TaskContext';
import { useProfile } from '../../context/ProfileContext';
import { useApi } from '../../context/ApiContext';
import { useBusy } from '../../hooks/useBusy';
import { usePersistedState } from '../../hooks/usePersistedState';
import { todayISO } from '../../data/mockData';

const emptyForm = {
  title: '',
  description: '',
  priority: 'medium',
  status: 'todo',
  dueDate: todayISO(),
  tags: '',
  projectId: '',
  recurrence: 'none',
};

/**
 * Everything a brand-new task collects in its Subtasks / Files / Time tabs BEFORE it exists.
 * It is handed to `createTask` in one go when the person presses "Create task", so nothing
 * has to be saved first and nothing is lost if they cancel.
 */
const emptyDraft = { subtasks: [], attachments: [], timeEntries: [], estimatedMinutes: 0, timerStartedAt: null };

let draftCounter = 1;
// Unique across refreshes too: a draft restored after a reload may already hold ids from the previous page load.
const draftId = (prefix) => `${prefix}-draft-${Date.now().toString(36)}${draftCounter++}`;

/** Tab API backed by a draft that lives only inside the open dialog. */
function useDraftApi(draft, setDraft, authorName, draftRef, api) {
  return {
    subtasks: draft.subtasks,
    attachments: draft.attachments,
    timeEntries: draft.timeEntries,
    estimatedMinutes: draft.estimatedMinutes,
    timerStartedAt: draft.timerStartedAt,
    addSubtask: (title) => setDraft((d) => ({ ...d, subtasks: [...d.subtasks, { id: draftId('st'), title, done: false }] })),
    toggleSubtask: (id) => setDraft((d) => ({ ...d, subtasks: d.subtasks.map((s) => (s.id === id ? { ...s, done: !s.done } : s)) })),
    removeSubtask: (id) => setDraft((d) => ({ ...d, subtasks: d.subtasks.filter((s) => s.id !== id) })),
    addAttachment: (file) => setDraft((d) => ({
      ...d,
      attachments: [...d.attachments, { ...file, id: draftId('a'), uploadedBy: authorName, uploadedAt: new Date().toISOString(), version: 1 }],
    })),
    removeAttachment: (id) => {
      const gone = draftRef.current.attachments.find((a) => a.id === id);
      if (gone?.fileId) api.files.deleteFile(gone.fileId).catch(() => {});
      setDraft((d) => ({ ...d, attachments: d.attachments.filter((a) => a.id !== id) }));
    },
    addTimeEntry: (minutes, note) => setDraft((d) => ({
      ...d,
      timeEntries: [...d.timeEntries, { id: draftId('te'), minutes, note, loggedAt: new Date().toISOString() }],
    })),
    setEstimate: (minutes) => setDraft((d) => ({ ...d, estimatedMinutes: minutes })),
    startTimer: () => setDraft((d) => (d.timerStartedAt ? d : { ...d, timerStartedAt: Date.now() })),
    stopTimer: () => setDraft((d) => {
      if (!d.timerStartedAt) return d;
      const minutes = Math.max(1, Math.round((Date.now() - d.timerStartedAt) / 60000));
      return {
        ...d,
        timerStartedAt: null,
        timeEntries: [...d.timeEntries, { id: draftId('te'), minutes, note: 'Tracked via timer', loggedAt: new Date().toISOString() }],
      };
    }),
  };
}

/** Tab API backed by a task that already exists in the workspace. */
function useSavedApi(task) {
  const ctx = useTasks();
  const id = task?.id;
  return {
    subtasks: task?.subtasks || [],
    attachments: task?.attachments || [],
    timeEntries: task?.timeEntries || [],
    estimatedMinutes: task?.estimatedMinutes || 0,
    timerStartedAt: id ? ctx.timers[id] || null : null,
    addSubtask: (title) => ctx.addSubtask(id, title),
    toggleSubtask: (sid) => ctx.toggleSubtask(id, sid),
    removeSubtask: (sid) => ctx.removeSubtask(id, sid),
    addAttachment: (file) => ctx.addAttachment(id, file),
    removeAttachment: (aid) => ctx.removeAttachment(id, aid),
    addTimeEntry: (minutes, note) => ctx.addTimeEntry(id, minutes, note),
    setEstimate: (minutes) => ctx.setEstimate(id, minutes),
    startTimer: () => ctx.startTimer(id),
    stopTimer: () => ctx.stopTimer(id),
  };
}

/**
 * Shared engine behind the task dialog. Returns the pieces of a create/edit task form
 * (`body`, `footer`, `title`) so it can live inside TaskModal AND inside the calendar's
 * "Add" dialog without duplicating any logic.
 *
 * Creating: Details, Subtasks, Files and Time are all usable straight away. Whatever is
 * added is held in a draft and saved together with the task when "Create task" is pressed.
 * Editing: the same tabs write straight to the saved task.
 *
 * `discard()` must be called when the dialog is dismissed without creating, to free any
 * file blobs picked while drafting.
 */
export default function useTaskEditor({
  open,
  onClose,
  task = null,
  defaultStatus = 'todo',
  defaultDueDate = null,
  defaultProjectId = null,
  persistScope = 'taskEditor', // names this editor's saved state, so two editors on one page never share it
}) {
  const { createTask, updateTask, deleteTask, projects, tasks, timers } = useTasks();
  const { profile } = useProfile();
  const { api: dataApi } = useApi(); // the data layer (file uploads); `api` below is the tab adapter
  // The unsaved form, the open tab and the not-yet-created subtasks/files/time all survive a refresh.
  const [form, setForm, formRestored] = usePersistedState(`${persistScope}.form`, emptyForm);
  const [errors, setErrors] = useState({});
  const [tab, setTab] = usePersistedState(`${persistScope}.tab`, 'details');
  const [draft, setDraft] = usePersistedState(`${persistScope}.draft`, emptyDraft);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [guard, busy] = useBusy();
  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  });

  // Latest incoming props, read inside the init effect below without making them dependencies.
  const latest = useRef({});
  useEffect(() => {
    latest.current = { task, defaultStatus, defaultDueDate, defaultProjectId, projects };
  });

  /**
   * Initialise the form (and jump to the Details tab) ONLY when the dialog opens or switches to a
   * different task. Keying on `open` + task id means in-dialog activity (adding a subtask, a file…)
   * never resets the dialog or wipes unsaved edits.
   */
  const initKey = open ? (task?.id ?? 'new') : null;
  // After a refresh the dialog comes back already filled in: skip the "start fresh" reset for that one opening.
  const restoredFor = useRef(formRestored && open ? initKey : null);
  useEffect(() => {
    if (initKey === null) {
      restoredFor.current = null;
      return;
    }
    if (restoredFor.current === initKey) return;
    const { task: t, defaultStatus: status, defaultDueDate: due, defaultProjectId: projId, projects: projs } = latest.current;
    setTab('details');
    setDraft(emptyDraft);
    setConfirmDelete(false);
    if (t) {
      setForm({
        title: t.title,
        description: t.description,
        priority: t.priority,
        status: t.status,
        dueDate: t.dueDate,
        tags: t.tags.join(', '),
        projectId: t.projectId,
        recurrence: t.recurrence || 'none',
      });
    } else {
      setForm({ ...emptyForm, status, dueDate: due || todayISO(), projectId: projId || (projs[0]?.id ?? '') });
    }
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the setters are stable; only opening/switching tasks re-runs this
  }, [initKey]);

  const isEditing = Boolean(task);
  // Keep the "live" task in sync as subtasks/comments/etc. mutate it elsewhere in context.
  const liveTask = task ? tasks.find((t) => t.id === task.id) || task : null;

  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  // Personal tasks belong to the person and to the project they were opened from, so
  // Assignee/Project are only editable for shared group tasks.

  const validate = () => {
    const e = {};
    if (!form.title.trim()) e.title = 'Title is required.';
    if (!form.dueDate) e.dueDate = 'Due date is required.';
    if (!form.projectId) e.projectId = 'Select a project.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // People are never sent by name: a personal task belongs to (and is assigned to) the signed-in
  // person, and team tasks are created from the Team hub, where the assignee is picked by id.
  const buildPayload = () => ({
    title: form.title.trim(),
    description: form.description.trim(),
    priority: form.priority,
    status: form.status,
    dueDate: form.dueDate,
    tags: form.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
    projectId: form.projectId,
    recurrence: form.recurrence,
  });

  /** Deletes the files uploaded while drafting (call when dismissing without creating). */
  const discard = () => {
    if (isEditing) return;
    draftRef.current.attachments.forEach((a) => a.fileId && dataApi.files.deleteFile(a.fileId).catch(() => {}));
    setDraft(emptyDraft);
  };

  const requestClose = () => {
    discard();
    onClose();
  };

  const handleSubmit = (ev) => {
    ev?.preventDefault?.();
    return guard(() => submit());
  };

  const submit = async () => {
    if (!validate()) {
      setTab('details'); // the errors live on the Details tab
      return;
    }
    const payload = buildPayload();
    let saved;
    if (isEditing) {
      saved = await updateTask(task.id, payload);
    } else {
      // Subtasks, files and time collected while drafting are saved WITH the task. Files were uploaded
      // as they were picked, so only their ids travel with the task.
      saved = await createTask(
        {
          ...payload,
          subtasks: draft.subtasks,
          attachments: draft.attachments.map((a) => ({ fileId: a.fileId, type: a.type, size: a.size })),
          timeEntries: draft.timeEntries,
          estimatedMinutes: draft.estimatedMinutes,
        },
        { timerStartedAt: draft.timerStartedAt },
      );
    }
    // If the server refused it (the reason is shown in a banner) the dialog stays open and nothing typed is lost.
    if (saved) onClose();
  };

  const handleDelete = () => guard(async () => {
    if (!confirmDelete) return setConfirmDelete(true);
    if (task) await deleteTask(task.id);
    onClose();
  });

  const savedApi = useSavedApi(liveTask);
  const draftApi = useDraftApi(draft, setDraft, profile.name, draftRef, dataApi);
  const api = isEditing ? savedApi : draftApi;

  const tabs = [
    { key: 'details', label: 'Details', icon: FileText },
    { key: 'subtasks', label: 'Subtasks', icon: ListTodo, count: api.subtasks.length },
    { key: 'files', label: 'Files', icon: Paperclip, count: api.attachments.length },
    { key: 'time', label: 'Time', icon: Clock3, live: isEditing ? Boolean(liveTask && timers[liveTask.id]) : Boolean(draft.timerStartedAt) },
  ];

  const draftNote = (text) => (
    <p className="flex items-center gap-2 rounded-lg bg-brand-500/10 px-3 py-2 mb-4 text-fluid-xs text-brand-700 dark:text-brand-300">
      <Timer size={14} className="shrink-0" />
      {text}
    </p>
  );

  const body = (
    <>
      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      <div className="pt-4">
        {tab === 'details' && (
          <form onSubmit={handleSubmit} noValidate>
            {!isEditing && draftNote('Your timer starts automatically as soon as you create this task.')}
            <DetailsTab form={form} errors={errors} update={update} projects={projects} />
          </form>
        )}

        {tab === 'subtasks' && (
          <>
            {!isEditing && draftNote('Subtasks you add here are saved together with the task when you create it.')}
            <SubtasksTab api={api} />
          </>
        )}
        {tab === 'files' && (
          <>
            {!isEditing && draftNote('Files you add here are attached to the task when you create it.')}
            <FilesTab api={api} />
          </>
        )}
        {tab === 'time' && (
          <>
            {!isEditing && draftNote('Time you log here is saved with the task. A timer also starts automatically when you create it.')}
            <TimeTab api={api} />
          </>
        )}
      </div>
    </>
  );

  const footer = (
    <>
      {isEditing && (
        <Button variant="ghost" onClick={handleDelete} disabled={busy} icon={<Trash2 size={15} />} className="mr-auto !text-coral-600">
          {confirmDelete ? 'Click again to delete' : 'Delete'}
        </Button>
      )}
      <Button variant="secondary" onClick={requestClose}>Cancel</Button>
      <Button variant="primary" onClick={handleSubmit} disabled={busy}>{busy ? 'Saving…' : isEditing ? 'Save changes' : 'Create task'}</Button>
    </>
  );

  return { title: isEditing ? 'Edit task' : 'Create task', body, footer, discard, requestClose };
}
