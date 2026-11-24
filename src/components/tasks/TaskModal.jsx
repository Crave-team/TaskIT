import Modal from '../common/Modal';
import useTaskEditor from './useTaskEditor';

/**
 * Modal form for creating a new task or editing an existing one. Reused for
 * both flows: pass `task` to edit, or omit it (with `defaultStatus`) to
 * create. The Details / Subtasks / Files / Time tabs are all available
 * while creating too — anything added is saved together with the new task.
 *
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   task?: import('../../types').Task | null,
 *   defaultStatus?: string,
 *   defaultDueDate?: string,
 *   defaultProjectId?: string | null,
 * }} props
 */
export default function TaskModal({ open, onClose, task = null, defaultStatus = 'todo', defaultDueDate = null, defaultProjectId = null }) {
  const editor = useTaskEditor({ open, onClose, task, defaultStatus, defaultDueDate, defaultProjectId, persistScope: 'taskModal' });

  return (
    <Modal open={open} onClose={editor.requestClose} title={editor.title} size="lg" footer={editor.footer}>
      {editor.body}
    </Modal>
  );
}
