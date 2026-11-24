import KanbanColumn from './KanbanColumn';
import { STATUS_META } from '../../data/mockData';
import { useTasks } from '../../context/TaskContext';

/**
 * Horizontally-scrolling Kanban board with one column per task status.
 *
 * @param {{
 *   tasks: import('../../types').Task[],
 *   onCardClick: (task: import('../../types').Task) => void,
 *   onAddClick: (status: string) => void,
 * }} props
 */
export default function KanbanBoard({ tasks, onCardClick, onAddClick }) {
  const { moveTaskStatus } = useTasks();

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 -mx-1 px-1">
      {Object.entries(STATUS_META).map(([key, meta]) => (
        <KanbanColumn
          key={key}
          statusKey={key}
          label={meta.label}
          tasks={tasks.filter((t) => t.status === key)}
          onCardClick={onCardClick}
          onAddClick={() => onAddClick(key)}
          onDropTask={moveTaskStatus}
        />
      ))}
    </div>
  );
}
