import { DEMO_TASKS, DEMO_PROJECTS } from '../../../data/demoData';

/** Same rule the real TaskContext uses for a task's progress bar. */
export const progressOf = (task) => {
  if (task.subtasks && task.subtasks.length > 0) {
    return Math.round((task.subtasks.filter((s) => s.done).length / task.subtasks.length) * 100);
  }
  return task.status === 'done' ? 100 : task.status === 'review' ? 75 : task.status === 'in-progress' ? 40 : 0;
};

export const SAMPLE_TASKS = DEMO_TASKS;
export const SAMPLE_PROJECTS = DEMO_PROJECTS;

/** First `n` sample tasks for a status. */
export const tasksWithStatus = (status, n) => SAMPLE_TASKS.filter((t) => t.status === status).slice(0, n);
