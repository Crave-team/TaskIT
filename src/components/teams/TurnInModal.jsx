import { useEffect, useRef, useState } from 'react';
import { usePersistedState } from '../../hooks/usePersistedState';
import { Upload, X, CalendarDays, Send, Info, Save } from 'lucide-react';
import Badge from '../common/Badge';
import { PRIORITY_META } from '../../data/mockData';
import Modal from '../common/Modal';
import Button from '../common/Button';
import { collectFiles, iconForFile, formatBytes, MAX_FILE_BYTES } from '../common/FileViewer';
import { useTasks } from '../../context/TaskContext';
import { useApi } from '../../context/ApiContext';

/**
 * Turn In dialog. Files are optional — add some if the task asks for a deliverable, or
 * just turn it in with a note. The task then moves to "To Review" and stays there until
 * a group admin approves it (Done) or returns it (back to In Progress). Until then it
 * can be taken back with "Undo turn-in".
 *
 * After an undo or a return the earlier note and files are kept on the task (`turnInDraft`):
 * this dialog then opens as "Edit turn-in", pre-filled, so the member can remove or add files,
 * change the note, and either save the changes or turn it in again.
 */
export default function TurnInModal({ open, task, onClose }) {
  const { turnInTask, saveTurnInDraft } = useTasks();
  const { api } = useApi();
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef(null);
  const [picked, setPicked] = useState([]);
  const [note, setNote] = usePersistedState('turnInModal.note', '');
  // Which task the note was last filled in for, so a refresh keeps what was typed and a new task starts from its own draft.
  const [seededFor, setSeededFor] = usePersistedState('turnInModal.seededFor', null);
  const [removedIds, setRemovedIds] = useState([]);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);

  const draft = task?.turnInDraft || null;
  const draftFiles = draft?.files || [];
  const keptFiles = draftFiles.filter((f) => !removedIds.includes(f.fileId));
  const editing = Boolean(draft);

  useEffect(() => {
    if (!open || !task || seededFor === task.id) return;
    setNote(task.turnInDraft?.note || '');
    setRemovedIds([]);
    setSeededFor(task.id);
  }, [open, task, seededFor, setNote, setSeededFor]);

  const close = () => {
    setPicked([]);
    setNote('');
    setSeededFor(null);
    setRemovedIds([]);
    setError('');
    setDragging(false);
    onClose();
  };

  // Read the files into a real array BEFORE anything else: the input's live FileList is
  // emptied the moment we reset it, which used to make some uploads silently vanish.
  const addFiles = (fileList) => {
    const { accepted, rejected } = collectFiles(fileList);
    if (accepted.length) setPicked((prev) => [...prev, ...accepted]);
    setError(rejected.length ? `${rejected.map((f) => f.name).join(', ')} ${rejected.length === 1 ? 'is' : 'are'} larger than ${formatBytes(MAX_FILE_BYTES)} and was skipped.` : '');
  };

  // `save` keeps the task In Progress (just stores the edits); otherwise it is turned in for review.
  const send = async (save) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      // Upload the new files first, then send their ids along with the earlier files that are kept.
      const stored = await Promise.all(picked.map((f) => api.files.uploadFile(f)));
      const submission = {
        files: stored.map((f) => ({ fileId: f.id, size: f.size })),
        note: note.trim(),
        ...(editing ? { keepFileIds: keptFiles.map((f) => f.fileId) } : {}),
      };
      await (save ? saveTurnInDraft(task.id, submission) : turnInTask(task.id, submission));
      close();
    } finally {
      setSubmitting(false);
    }
  };
  const submit = (e) => {
    e?.preventDefault();
    send(false);
  };

  if (!task) return null;

  return (
    <Modal
      open={open}
      onClose={close}
      title={editing ? 'Edit turn-in' : 'Turn in task'}
      footer={
        <>
          <Button variant="secondary" onClick={close}>Cancel</Button>
          {editing && <Button variant="secondary" icon={<Save size={14} />} onClick={() => send(true)}>Save changes</Button>}
          <Button icon={<Send size={14} />} onClick={submit}>Turn in</Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <div>
          <p className="text-fluid-xs text-ink-500">Task</p>
          <p className="text-fluid-base font-semibold text-ink-900 dark:text-white">{task.title}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge tone={PRIORITY_META[task.priority].color}>{PRIORITY_META[task.priority].label}</Badge>
            <span className="inline-flex items-center gap-1 text-fluid-xs text-ink-500">
              <CalendarDays size={13} /> Due {new Date(`${task.dueDate}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </span>
          </div>
          {task.description && <p className="mt-2 text-fluid-sm text-ink-700 dark:text-ink-300 whitespace-pre-wrap">{task.description}</p>}
        </div>

        {task.returned && (
          <div className="rounded-xl border border-coral-500/30 bg-coral-500/8 px-3.5 py-3">
            <p className="text-fluid-xs font-semibold text-coral-600">Returned by {task.returned.by}</p>
            <p className="mt-0.5 text-fluid-sm text-ink-900 dark:text-white">{task.returned.note || 'Please revise and turn it in again.'}</p>
          </div>
        )}

        {editing && (
          <div>
            <p className="block text-fluid-xs font-medium text-ink-500 mb-1.5">Your earlier files <span className="font-normal">(kept — remove any you don’t want to resend)</span></p>
            {keptFiles.length === 0 ? (
              <p className="text-fluid-xs text-ink-500">{draftFiles.length === 0 ? 'No files were attached before.' : 'All earlier files removed.'}</p>
            ) : (
              <ul className="space-y-1.5">
                {keptFiles.map((f) => {
                  const Icon = iconForFile(f);
                  return (
                    <li key={f.fileId} className="flex items-center gap-2 rounded-lg bg-ink-500/5 dark:bg-white/5 px-3 py-2">
                      <Icon size={15} className="text-brand-600 shrink-0" />
                      <span className="flex-1 min-w-0 truncate text-fluid-sm text-ink-900 dark:text-white">{f.name}</span>
                      <span className="text-fluid-xs text-ink-500 shrink-0">{formatBytes(f.size)}</span>
                      <button type="button" onClick={() => setRemovedIds((r) => [...r, f.fileId])} aria-label={`Remove ${f.name}`} className="p-0.5 text-ink-500 hover:text-coral-600">
                        <X size={14} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        <div>
          <p className="block text-fluid-xs font-medium text-ink-500 mb-1.5">{editing ? 'Add more files' : 'Files'} <span className="font-normal">(optional)</span></p>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            aria-label="Choose files to turn in"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
            className={`w-full flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed py-5 text-fluid-sm transition-colors ${
              dragging ? 'border-brand-600 bg-brand-500/10 text-brand-700' : 'border-ink-500/30 dark:border-white/20 text-ink-700 dark:text-ink-300 hover:bg-brand-500/8'
            }`}
          >
            <Upload size={18} />
            <span className="font-medium">{dragging ? 'Drop to add' : 'Click or drag files here'}</span>
            <span className="text-fluid-xs text-ink-500">Any file type · up to {formatBytes(MAX_FILE_BYTES)} each</span>
          </button>
          {picked.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {picked.map((f, i) => {
                const Icon = iconForFile({ name: f.name, mime: f.type, url: 'x' });
                return (
                  <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-lg bg-ink-500/5 dark:bg-white/5 px-3 py-2">
                    <Icon size={15} className="text-brand-600 shrink-0" />
                    <span className="flex-1 min-w-0 truncate text-fluid-sm text-ink-900 dark:text-white">{f.name}</span>
                    <span className="text-fluid-xs text-ink-500 shrink-0">{formatBytes(f.size)}</span>
                    <button type="button" onClick={() => setPicked((p) => p.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`} className="p-0.5 text-ink-500 hover:text-coral-600">
                      <X size={14} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {error && <p role="alert" className="mt-1.5 text-fluid-xs text-coral-600">{error}</p>}
        </div>

        <div>
          <label htmlFor="turnin-note" className="block text-fluid-xs font-medium text-ink-500 mb-1.5">Note (optional)</label>
          <textarea
            id="turnin-note"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Anything your admin should know?"
            className="w-full rounded-lg border border-ink-500/15 dark:border-white/10 bg-white dark:bg-surface-dark px-3 py-2 text-fluid-sm text-ink-900 dark:text-white placeholder:text-ink-500 focus:outline-none resize-none"
          />
        </div>

        <p className="flex items-start gap-2 rounded-lg bg-brand-500/10 px-3 py-2 text-fluid-xs text-ink-700 dark:text-ink-300">
          <Info size={14} className="text-brand-600 mt-0.5 shrink-0" />
          Your task moves to <strong className="font-semibold">To Review</strong>. It becomes Done only after a group admin approves it, and you can undo the turn-in until then.
          {editing && ' “Save changes” keeps it In Progress so you can finish later.'}
        </p>
      </form>
    </Modal>
  );
}
