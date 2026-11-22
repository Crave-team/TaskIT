import { db, transaction } from '../repo.js';
import { newId } from '../ids.js';
import { badRequest, forbidden, notFound } from '../errors.js';
import {
  nowISO, requireActor, isGroupAdmin, isGroupMember, adminIdsOf,
  logActivity, notify, releaseFile, releaseFiles, releaseTaskFiles,
} from '../core.js';

/**
 * Tasks, team task workflow, projects, milestones and reminders.
 *
 * Every function takes `ctx` (the caller, resolved from the session) first and enforces its own
 * permissions — the UI hiding a button is a convenience, never the rule:
 *   personal task / project : only its owner
 *   team task / project     : the team's admins manage it; the assignee works on it
 *   site admins             : see everything, but have no personal tasks
 *
 * Arrays inside a document (subtasks, comments, history, time entries...) are changed with the
 * repository's atomic `ops` (push / pull / patchIn), never by re-writing the whole array, so two
 * people editing the same task at the same moment cannot overwrite each other.
 */

const STATUSES = ['todo', 'in-progress', 'review', 'done'];
const PRIORITIES = ['low', 'medium', 'high'];
const STATUS_LABEL = { todo: 'To Do', 'in-progress': 'In Progress', review: 'To Review', done: 'Done' };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const isStr = (v) => typeof v === 'string';
const text = (v) => (isStr(v) ? v.trim() : '');
const need = (cond, message, field) => { if (!cond) throw badRequest(message, field); };

async function nameOfUser(id) {
  return (await db.users.get(id))?.name ?? 'Former member';
}
const historyEntry = (actor, type, detail) => ({
  id: newId(), at: nowISO(), type, detail, byId: actor?.id ?? null, byName: actor?.name ?? 'System',
});
const cleanTags = (tags) => [...new Set((Array.isArray(tags) ? tags : []).map((t) => String(t).trim().slice(0, 40)).filter(Boolean))].slice(0, 30);
const toMinutes = (n) => Math.max(0, Math.min(Math.round(Number(n) || 0), 60 * 24 * 365));

// ---------------------------------------------------------------- lookups & permissions

async function mustTask(id) {
  const task = await db.tasks.get(id);
  if (!task) throw notFound('Task not found.');
  return task;
}
async function mustProject(id) {
  const project = await db.projects.get(id);
  if (!project) throw notFound('Project not found.');
  return project;
}

/** Edit / delete / reassign: team admins for team tasks, the owner for personal ones. */
async function canManageTask(actor, task) {
  return task.groupId ? isGroupAdmin(await db.groups.get(task.groupId), actor.id) : task.ownerId === actor.id;
}
/** Work on it (subtasks, files, time, timer, turn-in): the assignee of a team task, the owner of a personal one. */
function isResponsible(actor, task) {
  return task.groupId ? task.assigneeId === actor.id : task.ownerId === actor.id;
}
async function canContribute(actor, task) {
  return (await canManageTask(actor, task)) || isResponsible(actor, task);
}
async function canManageProject(actor, project) {
  return project.groupId ? isGroupAdmin(await db.groups.get(project.groupId), actor.id) : project.ownerId === actor.id;
}

/** Which tasks a person may read: their own, the team tasks they work on, every task of teams they admin. */
export async function visibleTasksFor(actor) {
  if (actor.accountRole === 'admin') return db.tasks.find();
  const personal = await db.tasks.find({ ownerId: actor.id, groupId: null });
  const groups = await db.groups.find({ memberIds: actor.id });
  const adminIds = groups.filter((g) => isGroupAdmin(g, actor.id)).map((g) => g.id);
  const otherIds = groups.map((g) => g.id).filter((id) => !adminIds.includes(id));
  const adminTasks = adminIds.length ? await db.tasks.find({ groupId: { $in: adminIds } }) : [];
  const assigned = otherIds.length ? await db.tasks.find({ groupId: { $in: otherIds }, assigneeId: actor.id }) : [];
  return [...personal, ...adminTasks, ...assigned];
}

/** Projects a person may read: their own personal ones plus every project of teams they belong to. */
export async function visibleProjectsFor(actor) {
  if (actor.accountRole === 'admin') return db.projects.find();
  const personal = await db.projects.find({ ownerId: actor.id, groupId: null });
  const groupIds = (await db.groups.find({ memberIds: actor.id })).map((g) => g.id);
  const team = groupIds.length ? await db.projects.find({ groupId: { $in: groupIds } }) : [];
  return [...personal, ...team];
}

// ---------------------------------------------------------------- timers

/**
 * What stopping a running timer changes: `{ patch, entry }` (clear the start time, log the minutes) or null.
 * The time entry is appended atomically with `ops.push`.
 */
function stopTimer_(task, note = 'Tracked via timer') {
  if (!task.timerStartedAt) return null;
  const minutes = Math.max(1, Math.round((Date.now() - task.timerStartedAt) / 60000));
  return { patch: { timerStartedAt: null }, entry: { id: newId(), minutes, note, loggedAt: nowISO() } };
}

/** Combines the "stop the timer" change with other pushes into one atomic update. */
const withStop = (stop, patch = {}, push = {}) => ({
  patch: { ...(stop?.patch || {}), ...patch },
  ops: { push: { ...(stop ? { timeEntries: stop.entry } : {}), ...push } },
});

export async function startTimer(ctx, taskId) {
  const actor = await requireActor(ctx);
  const task = await mustTask(taskId);
  if (!(await canContribute(actor, task))) throw forbidden();
  if (task.timerStartedAt) return task.timerStartedAt;
  return (await db.tasks.update(taskId, { timerStartedAt: Date.now() })).timerStartedAt;
}

/** @returns {number} minutes logged (0 if no timer was running) */
export async function stopTimer(ctx, taskId, note = 'Tracked via timer') {
  const actor = await requireActor(ctx);
  const task = await mustTask(taskId);
  if (!(await canContribute(actor, task))) throw forbidden();
  const stop = stopTimer_(task, isStr(note) ? note.slice(0, 200) : 'Tracked via timer');
  if (!stop) return 0;
  const { patch, ops } = withStop(stop);
  await db.tasks.update(taskId, patch, ops);
  return stop.entry.minutes;
}

// ---------------------------------------------------------------- create / update / delete

/** Validates uploaded-file references and turns them into attachment records. */
async function attachmentsFrom(actor, list = []) {
  need(Array.isArray(list), 'Invalid attachments.');
  const out = [];
  for (const a of list) {
    const file = isStr(a?.fileId) ? await db.files.get(a.fileId) : null;
    // Only files the caller uploaded can be attached (otherwise anyone could attach, then download, a stranger's file).
    if (!file || file.ownerId !== actor.id) throw badRequest('One of the attached files was not found.');
    out.push({
      id: newId(), fileId: file.id, name: file.name, mime: file.mime, url: file.url,
      type: isStr(a.type) ? a.type.slice(0, 30) : 'other', size: a.size ?? '', sizeBytes: file.size, version: 1,
      uploadedById: actor.id, uploadedByName: actor.name, uploadedAt: nowISO(),
    });
  }
  return out;
}

/**
 * Who can take a task made for `roleId`: members of the team who hold that role and are not suspended.
 * Throws a plain-language error when the role is unknown or nobody holds it, so no task is ever left unassigned.
 */
async function roleHolders(group, roleId) {
  const role = isStr(roleId) ? (group.roles || []).find((r) => r.id === roleId) : null;
  if (!role) throw badRequest('Pick a role for this task.', 'roleId');
  const heldBy = group.memberIds.filter((id) => group.memberRoles?.[id] === roleId);
  const users = heldBy.length ? await db.users.find({ id: { $in: heldBy } }) : [];
  const holders = users.filter((u) => u.status !== 'suspended').map((u) => u.id);
  if (holders.length === 0) throw badRequest(`Nobody in this team has the \"${role.name}\" role yet.`, 'roleId');
  return { role, holders };
}

/** Uniform random pick. `rand` is injectable so tests can pin the draw. */
export const pickRandom = (list, rand = Math.random) => list[Math.min(list.length - 1, Math.floor(rand() * list.length))];

/** Fisher-Yates shuffle into a new array. `rand` is injectable so tests can pin it. */
export function shuffled(list, rand = Math.random) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.min(i, Math.floor(rand() * (i + 1)));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Splits `count` tasks of ONE role over its `holders`: everyone gets the same whole share, and the leftover tasks go to
 * that many distinct holders picked at random (5 tasks, 4 holders: one each, and one random person gets a second).
 * The returned list (one holder id per task) is shuffled so the order is not predictable either.
 * It only looks at this one batch: nothing is remembered between requests.
 */
export function splitEvenly(count, holders, rand = Math.random) {
  const share = Math.floor(count / holders.length);
  const extra = shuffled(holders, rand).slice(0, count % holders.length);
  return shuffled([...holders.flatMap((id) => Array(share).fill(id)), ...extra], rand);
}

/**
 * Creates a task. `input` may already carry the subtasks / attachments (as `{ fileId }`) /
 * timeEntries / estimatedMinutes the person added while it was still a draft.
 * Team tasks: only a team admin may create them, and they MUST name a team role (`roleId`): the server then picks the
 * assignee at random among the people holding that role (a batch is split evenly, see `createTeamTasks`). A hand-picked
 * `assigneeId` in the request is ignored; reassign afterwards.
 * `options.timerStartedAt` backdates the auto-started timer if one ran while drafting.
 */
export async function createTask(ctx, input = {}, options = {}) {
  return insertTask(ctx, input, options);
}

/**
 * `plan` is set only by createTeamTasks, never from a request: { assigneeId, note } is the person it already chose from
 * the role's holders. Without a plan the assignee is a plain random pick.
 */
async function insertTask(ctx, input, options, plan = null) {
  const actor = await requireActor(ctx);
  const title = text(input.title);
  need(title, 'Title is required.', 'title');
  need(isStr(input.dueDate) && DATE_RE.test(input.dueDate), 'Due date is required.', 'dueDate');
  const project = isStr(input.projectId) ? await db.projects.get(input.projectId) : null;
  if (!project) throw badRequest('Select a project.', 'projectId');

  let groupId = null;
  let assigneeId = actor.id;
  let role = null;
  let how = '';
  if (project.groupId) {
    const group = await db.groups.get(project.groupId);
    if (!isGroupAdmin(group, actor.id)) throw forbidden('Only a team admin can create tasks in a team project.');
    groupId = group.id;
    const { role: picked, holders } = await roleHolders(group, input.roleId);
    role = picked;
    // The batch's plan is trusted only while its person still holds the role; otherwise draw again.
    assigneeId = plan && holders.includes(plan.assigneeId) ? plan.assigneeId : pickRandom(holders);
    how = plan ? plan.note : `random ${role.name}`;
  } else {
    if (project.ownerId !== actor.id) throw forbidden('That is not your project.');
    if (actor.accountRole === 'admin') throw forbidden('Admin accounts do not have personal tasks.');
  }

  const status = STATUSES.includes(input.status) ? input.status : 'todo';
  const trackedByMe = !groupId || assigneeId === actor.id;
  const startedAt = Number(options?.timerStartedAt);
  const assigneeName = assigneeId ? await nameOfUser(assigneeId) : null;
  const task = await db.tasks.insert({
    title,
    description: text(input.description),
    priority: PRIORITIES.includes(input.priority) ? input.priority : 'medium',
    status,
    dueDate: input.dueDate,
    tags: cleanTags(input.tags),
    recurrence: isStr(input.recurrence) ? input.recurrence : 'none',
    projectId: project.id,
    groupId,
    ownerId: actor.id,
    assigneeId,
    roleId: role?.id ?? null,
    roleName: role?.name ?? null,
    // Team timer: starts the moment a team task is handed to someone.
    assignedAt: groupId && assigneeId ? nowISO() : null,
    autoAssigned: Boolean(groupId),
    subtasks: (Array.isArray(input.subtasks) ? input.subtasks : []).filter((s) => text(s?.title)).map((s) => ({ id: newId(), title: text(s.title), done: Boolean(s.done) })),
    comments: [],
    attachments: await attachmentsFrom(actor, input.attachments),
    timeEntries: (Array.isArray(input.timeEntries) ? input.timeEntries : []).map((e) => ({ id: newId(), minutes: toMinutes(e?.minutes), note: isStr(e?.note) ? e.note.slice(0, 200) : '', loggedAt: nowISO() })),
    estimatedMinutes: toMinutes(input.estimatedMinutes),
    dependsOn: [],
    history: groupId ? [historyEntry(actor, 'assigned', `Assigned to ${assigneeName} (${how})`)] : [],
    turnIn: null,
    turnInDraft: null,
    returned: null,
    previousTurnIns: [],
    completedAt: status === 'done' ? nowISO() : null,
    // Time tracking begins when a task is created — but not for team tasks only handed to someone else.
    timerStartedAt: trackedByMe && status !== 'done' ? (Number.isFinite(startedAt) && startedAt > 0 && startedAt <= Date.now() ? startedAt : Date.now()) : null,
    createdAt: nowISO(),
  });
  await logActivity(actor, 'created task', task.title, { groupId });
  if (assigneeId && assigneeId !== actor.id) {
    await notify(assigneeId, { type: 'assignment', message: `${actor.name} assigned you to "${task.title}".`, taskId: task.id });
  }
  return task;
}

/** Most tasks one "Create & assign" can make at once. */
const MAX_TEAM_TASK_ROWS = 50;

/**
 * Creates several tasks in a team project in one go. A row is { title, dueDate, roleId, tags?, priority?, estimatedMinutes? }.
 * Every row needs a role, and the SERVER picks who gets what, so the browser cannot choose or fake it. The rows of one
 * role are split evenly over the people holding it (`splitEvenly`): 5 tasks for a role of 4 people is one each plus a
 * second task for one randomly chosen person. Each batch is split on its own; nothing is carried over to the next one.
 * Rows are all checked before anything is created: if one is wrong, or its role has nobody in it, no task is made.
 * @returns {Promise<{ task: object, decision: { assigneeId: string, roleId: string, roleName: string } }[]>}
 */
export async function createTeamTasks(ctx, projectId, rows) {
  const actor = await requireActor(ctx);
  const project = isStr(projectId) ? await db.projects.get(projectId) : null;
  if (!project?.groupId) throw badRequest('Select a team project.', 'projectId');
  const group = await db.groups.get(project.groupId);
  if (!group || !isGroupAdmin(group, actor.id)) throw forbidden('Only a team admin can create tasks in a team project.');
  need(Array.isArray(rows) && rows.length > 0, 'Add at least one task.', 'rows');
  need(rows.length <= MAX_TEAM_TASK_ROWS, `Create at most ${MAX_TEAM_TASK_ROWS} tasks at once.`, 'rows');
  const holdersOfRole = new Map();
  for (const [i, row] of rows.entries()) {
    need(text(row?.title), `Task ${i + 1} needs a title.`, 'rows');
    need(isStr(row.dueDate) && DATE_RE.test(row.dueDate), `Task ${i + 1} needs a due date.`, 'rows');
    need(isStr(row.roleId) && row.roleId, `Task ${i + 1} needs a role.`, 'rows');
    if (!holdersOfRole.has(row.roleId)) {
      // eslint-disable-next-line no-await-in-loop
      holdersOfRole.set(row.roleId, (await roleHolders(group, row.roleId)).holders);
    }
  }
  // One shuffled list of assignees per role, as long as that role has rows; each row takes the next one.
  const queues = new Map([...holdersOfRole].map(([roleId, holders]) => [roleId, splitEvenly(rows.filter((r) => r.roleId === roleId).length, holders)]));

  const out = [];
  await transaction(async () => {
    for (const row of rows) {
      // eslint-disable-next-line no-await-in-loop
      const task = await insertTask(ctx, {
        title: row.title,
        description: '',
        priority: PRIORITIES.includes(row.priority) ? row.priority : 'medium',
        status: 'todo',
        dueDate: row.dueDate,
        tags: Array.isArray(row.tags) ? row.tags : [],
        projectId: project.id,
        estimatedMinutes: row.estimatedMinutes,
        roleId: row.roleId,
      }, {}, { assigneeId: queues.get(row.roleId).shift(), note: 'split evenly' });
      out.push({ task, decision: { assigneeId: task.assigneeId, roleId: task.roleId, roleName: task.roleName } });
    }
  });
  return out;
}

/** Edits a task's details. Team task STATUS only changes through the turn-in workflow. */
export async function updateTask(ctx, id, patch = {}) {
  const actor = await requireActor(ctx);
  const task = await mustTask(id);
  if (!(await canManageTask(actor, task))) throw forbidden('You cannot edit this task.');
  const next = {};
  let ops = {};
  if (patch.title !== undefined) {
    need(text(patch.title), 'Title is required.', 'title');
    next.title = text(patch.title);
  }
  if (patch.description !== undefined) next.description = text(patch.description);
  if (PRIORITIES.includes(patch.priority)) next.priority = patch.priority;
  if (patch.dueDate !== undefined) {
    need(isStr(patch.dueDate) && DATE_RE.test(patch.dueDate), 'Due date is required.', 'dueDate');
    next.dueDate = patch.dueDate;
  }
  if (patch.tags !== undefined) next.tags = cleanTags(patch.tags);
  if (patch.recurrence !== undefined) next.recurrence = isStr(patch.recurrence) ? patch.recurrence : 'none';
  if (patch.projectId !== undefined && patch.projectId !== task.projectId) {
    const project = isStr(patch.projectId) ? await mustProject(patch.projectId) : null;
    const sameScope = project && (task.groupId ? project.groupId === task.groupId : !project.groupId && project.ownerId === actor.id);
    if (!sameScope) throw badRequest('Pick one of your own projects.', 'projectId');
    next.projectId = project.id;
  }
  if (patch.status !== undefined && patch.status !== task.status) {
    if (task.groupId) throw badRequest('A team task changes status by being turned in and approved.', 'status');
    need(STATUSES.includes(patch.status), 'Unknown status.', 'status');
    const change = statusChange(task, patch.status);
    Object.assign(next, change.patch);
    ops = change.ops;
  }
  const updated = await db.tasks.update(id, next, ops);
  await logActivity(actor, 'updated task', updated.title, { groupId: task.groupId });
  return updated;
}

/** Side effects of a personal-task status change: finishing stops the clock and stamps completion. */
function statusChange(task, status) {
  const stop = status === 'done' ? stopTimer_(task, 'Tracked until completed') : null;
  const { patch, ops } = withStop(stop, { status, completedAt: status === 'done' ? nowISO() : null });
  return { patch, ops };
}

/** Quick status change for a personal task (Kanban drag and drop). */
export async function moveTaskStatus(ctx, id, status) {
  const actor = await requireActor(ctx);
  const task = await mustTask(id);
  if (task.groupId) throw badRequest('Team tasks move by being turned in and approved.');
  if (!(await canManageTask(actor, task))) throw forbidden();
  need(STATUSES.includes(status), 'Unknown status.', 'status');
  if (status === task.status) return task;
  const { patch, ops } = statusChange(task, status);
  const updated = await db.tasks.update(id, patch, ops);
  await logActivity(actor, `moved task to ${STATUS_LABEL[status]}`, task.title, { groupId: null });
  return updated;
}

export async function deleteTask(ctx, id) {
  const actor = await requireActor(ctx);
  const task = await mustTask(id);
  if (!(await canManageTask(actor, task))) throw forbidden('You cannot delete this task.');
  await releaseTaskFiles(task);
  await db.tasks.remove(id);
  await logActivity(actor, 'deleted task', task.title, { groupId: task.groupId });
}

/** Most tasks one bulk delete can remove at once. */
const MAX_BULK_DELETE = 200;

/** Delete several tasks at once. All-or-nothing on permissions, and the removals run as one transaction. */
export async function deleteTasks(ctx, ids) {
  const actor = await requireActor(ctx);
  need(Array.isArray(ids) && ids.every(isStr), 'Invalid input.');
  const uniqueIds = [...new Set(ids)];
  need(uniqueIds.length <= MAX_BULK_DELETE, `Delete at most ${MAX_BULK_DELETE} tasks at once.`);
  const tasks = [];
  for (const id of uniqueIds) tasks.push(await mustTask(id));
  if (tasks.length === 0) return;
  for (const t of tasks) {
    if (!(await canManageTask(actor, t))) throw forbidden('You cannot delete some of those tasks.');
  }
  await transaction(async () => {
    for (const t of tasks) {
      await releaseTaskFiles(t);
      await db.tasks.remove(t.id);
    }
  });
  // Each team's audit log records only its own tasks (personal tasks have no group).
  const byGroup = new Map();
  for (const t of tasks) byGroup.set(t.groupId ?? null, [...(byGroup.get(t.groupId ?? null) || []), t]);
  for (const [groupId, list] of byGroup) {
    const scope = groupId ? 'from the team project' : 'personal tasks';
    await logActivity(actor, `deleted ${list.length} task${list.length === 1 ? '' : 's'}`, list.length === 1 ? list[0].title : scope, { groupId });
  }
}

// ---------------------------------------------------------------- subtasks, comments, files, time

async function mutable(ctx, taskId) {
  const actor = await requireActor(ctx);
  const task = await mustTask(taskId);
  if (!(await canContribute(actor, task))) throw forbidden('You cannot change this task.');
  return { actor, task };
}

export async function addSubtask(ctx, taskId, title) {
  await mutable(ctx, taskId);
  need(text(title), 'Give the subtask a title.', 'title');
  const subtask = { id: newId(), title: text(title).slice(0, 200), done: false };
  await db.tasks.update(taskId, {}, { push: { subtasks: subtask } });
  return subtask;
}
export async function toggleSubtask(ctx, taskId, subtaskId) {
  const { task } = await mutable(ctx, taskId);
  const current = (task.subtasks || []).find((s) => s.id === subtaskId);
  if (!current) throw notFound('Subtask not found.');
  await db.tasks.update(taskId, {}, { patchIn: { subtasks: { id: subtaskId, patch: { done: !current.done } } } });
}
export async function removeSubtask(ctx, taskId, subtaskId) {
  await mutable(ctx, taskId);
  await db.tasks.update(taskId, {}, { pull: { subtasks: { id: subtaskId } } });
}

/** `mentionIds` are the people tagged in the comment; each gets a notification. */
export async function addComment(ctx, taskId, body, { mentionIds = [] } = {}) {
  const { actor, task } = await mutable(ctx, taskId);
  need(text(body), 'Write a comment first.', 'text');
  const comment = { id: newId(), text: text(body).slice(0, 5000), authorId: actor.id, authorName: actor.name, createdAt: nowISO() };
  await db.tasks.update(taskId, {}, { push: { comments: comment } });
  await logActivity(actor, 'commented on', task.title, { groupId: task.groupId });
  for (const id of [...new Set(Array.isArray(mentionIds) ? mentionIds : [])]) {
    if (isStr(id) && id !== actor.id) await notify(id, { type: 'mention', message: `${actor.name} mentioned you in a comment on "${task.title}".`, taskId });
  }
  return comment;
}

/** Attaches an already-uploaded file (`files.upload` first, then pass its id). */
export async function addAttachment(ctx, taskId, input) {
  const { actor, task } = await mutable(ctx, taskId);
  const [attachment] = await attachmentsFrom(actor, [input]);
  await db.tasks.update(taskId, {}, { push: { attachments: attachment } });
  await logActivity(actor, 'uploaded a file to', task.title, { groupId: task.groupId });
  return attachment;
}
export async function removeAttachment(ctx, taskId, attachmentId) {
  const { actor, task } = await mutable(ctx, taskId);
  const removed = (task.attachments || []).find((a) => a.id === attachmentId);
  if (!removed) return;
  await releaseFile(removed.fileId);
  await db.tasks.update(taskId, {}, { pull: { attachments: { id: attachmentId } } });
  await logActivity(actor, `deleted file "${removed.name}" from`, task.title, { groupId: task.groupId });
}

export async function addTimeEntry(ctx, taskId, minutes, note = '') {
  await mutable(ctx, taskId);
  const m = toMinutes(minutes);
  need(m >= 1, 'Enter the minutes you worked.', 'minutes');
  await db.tasks.update(taskId, {}, { push: { timeEntries: { id: newId(), minutes: m, note: isStr(note) ? note.slice(0, 200) : '', loggedAt: nowISO() } } });
}
export async function setEstimate(ctx, taskId, minutes) {
  await mutable(ctx, taskId);
  await db.tasks.update(taskId, { estimatedMinutes: toMinutes(minutes) });
}

// ---------------------------------------------------------------- team task workflow

async function teamTask(id) {
  const task = await mustTask(id);
  if (!task.groupId) throw badRequest('That is not a team task.');
  return task;
}
async function notifyAdmins(task, actor, message, type) {
  const group = await db.groups.get(task.groupId);
  if (!group) return;
  for (const id of adminIdsOf(group)) {
    if (id !== actor.id) await notify(id, { type, message, taskId: task.id });
  }
}

/** The assignee moves their own task between To Do and In Progress. */
export async function moveTeamTask(ctx, id, status) {
  const actor = await requireActor(ctx);
  const task = await teamTask(id);
  if (task.assigneeId !== actor.id) throw forbidden('Only the person it is assigned to can move it.');
  need(['todo', 'in-progress'].includes(status), 'A task only reaches Review by being turned in.');
  if (['done', 'review'].includes(task.status) || task.status === status) return task;
  const updated = await db.tasks.update(id, { status }, { push: { history: historyEntry(actor, 'moved', `Moved to ${STATUS_LABEL[status]}`) } });
  await logActivity(actor, `moved task to ${STATUS_LABEL[status]}`, task.title, { groupId: task.groupId });
  return updated;
}

/** Milliseconds from an ISO timestamp until now (never negative). */
const elapsedSince = (iso) => Math.max(0, Date.now() - (Date.parse(iso) || Date.now()));

/**
 * What the assignee had handed in, kept on the task as an editable draft once it is taken back or returned.
 * The files are NOT freed: they stay stored so the assignee can fix the submission and turn it in again.
 */
const draftFrom = (turnIn, reason) => (turnIn
  ? { files: turnIn.files || [], note: turnIn.note || '', savedAt: nowISO(), byId: turnIn.byId, byName: turnIn.byName, reason }
  : null);

/**
 * Builds the file list for a submission: the draft files the assignee chose to keep (`keepFileIds`),
 * plus freshly uploaded ones. Draft files that were dropped are freed, unless history still points at them.
 */
async function submissionFiles(actor, task, { files = [], keepFileIds } = {}) {
  const draftFiles = task.turnInDraft?.files || [];
  const keepAll = !Array.isArray(keepFileIds);
  need(keepAll || keepFileIds.every(isStr), 'Invalid input.');
  const kept = draftFiles.filter((f) => keepAll || keepFileIds.includes(f.fileId));
  const dropped = draftFiles.filter((f) => !kept.includes(f));
  const added = await attachmentsFrom(actor, files);
  return { files: [...kept, ...added], dropped };
}

/** Frees dropped draft files, except any a past turn-in record still references. */
async function releaseDropped(task, dropped) {
  const inHistory = new Set((task.previousTurnIns || []).flatMap((t) => (t?.files || []).map((f) => f.fileId)));
  await releaseFiles(dropped.filter((f) => !inHistory.has(f.fileId)));
}

/**
 * Turn in: optional files (already uploaded) and a note. Waits in To Review for a team admin.
 * After an undo or a return the earlier files and note are still on the task as a draft: they are
 * included again unless `keepFileIds` lists only some of them.
 */
export async function turnInTask(ctx, id, { files = [], note = '', keepFileIds } = {}) {
  const actor = await requireActor(ctx);
  const task = await teamTask(id);
  if (task.assigneeId !== actor.id) throw forbidden('Only the person it is assigned to can turn it in.');
  if (['done', 'review'].includes(task.status)) throw badRequest('This task is already turned in.');
  const { files: submitted, dropped } = await submissionFiles(actor, task, { files, keepFileIds });
  const detail = submitted.length ? `Turned in ${submitted.length} file${submitted.length === 1 ? '' : 's'} for review` : 'Turned in for review';
  const { patch, ops } = withStop(stopTimer_(task, 'Tracked until turned in'), {
    status: 'review',
    // The team timer stops here: total time from assignment (or creation, for older tasks) to this turn-in.
    turnIn: { files: submitted, note: text(note).slice(0, 5000), at: nowISO(), byId: actor.id, byName: actor.name, durationMs: elapsedSince(task.assignedAt || task.createdAt) },
    turnInDraft: null,
    returned: null,
  }, { history: historyEntry(actor, 'turned-in', detail) });
  const updated = await db.tasks.update(id, patch, ops);
  await releaseDropped(task, dropped);
  await logActivity(actor, 'turned in task', task.title, { groupId: task.groupId });
  await notifyAdmins(task, actor, `${actor.name} turned in \"${task.title}\" — it is waiting for your review.`, 'turn-in');
  return updated;
}

/**
 * Save changes to the submission without turning it in (after an undo or a return): edit the note, drop
 * earlier files (`keepFileIds`) or add new ones. The task stays in progress; nobody is notified.
 */
export async function saveTurnInDraft(ctx, id, { files = [], note = '', keepFileIds } = {}) {
  const actor = await requireActor(ctx);
  const task = await teamTask(id);
  if (task.assigneeId !== actor.id) throw forbidden('Only the person it is assigned to can edit the turn-in.');
  if (['done', 'review'].includes(task.status)) throw badRequest('Take the turn-in back before editing it.');
  const { files: kept, dropped } = await submissionFiles(actor, task, { files, keepFileIds });
  const updated = await db.tasks.update(id, {
    turnInDraft: { ...(task.turnInDraft || { byId: actor.id, byName: actor.name, reason: 'edit' }), files: kept, note: text(note).slice(0, 5000), savedAt: nowISO() },
  }, { push: { history: historyEntry(actor, 'draft-saved', 'Edited the turn-in') } });
  await releaseDropped(task, dropped);
  await logActivity(actor, 'edited the turn-in of', task.title, { groupId: task.groupId });
  return updated;
}

/** Take the turn-in back while it is still waiting for review. Its files and note stay as an editable draft. */
export async function undoTurnIn(ctx, id) {
  const actor = await requireActor(ctx);
  const task = await teamTask(id);
  if (task.assigneeId !== actor.id) throw forbidden();
  if (task.status !== 'review') throw badRequest('Only a task waiting for review can be taken back.');
  const updated = await db.tasks.update(id, {
    status: 'in-progress',
    turnIn: null,
    turnInDraft: draftFrom(task.turnIn, 'undo'),
  }, { push: { history: historyEntry(actor, 'undo-turn-in', 'Took back the turn-in') } });
  await logActivity(actor, 'undid turn in of', task.title, { groupId: task.groupId });
  await notifyAdmins(task, actor, `${actor.name} took back their turn-in of \"${task.title}\".`, 'turn-in');
  return updated;
}

/** Team admin: approve a task waiting in review -> Done. */
export async function approveTask(ctx, id) {
  const actor = await requireActor(ctx);
  const task = await teamTask(id);
  if (!(await canManageTask(actor, task))) throw forbidden('Only a team admin can approve tasks.');
  if (task.status !== 'review') throw badRequest('This task is not waiting for review.');
  const at = nowISO();
  const updated = await db.tasks.update(id, {
    status: 'done',
    completedAt: at,
    turnIn: task.turnIn ? { ...task.turnIn, approvedAt: at, approvedById: actor.id, approvedByName: actor.name } : task.turnIn,
  }, { push: { history: historyEntry(actor, 'approved', 'Approved — task is done') } });
  await logActivity(actor, 'approved task', task.title, { groupId: task.groupId });
  if (task.assigneeId && task.assigneeId !== actor.id) await notify(task.assigneeId, { type: 'approved', message: `${actor.name} approved "${task.title}". Nice work!`, taskId: id });
  return updated;
}

/** Team admin: send a task back with a reason -> In Progress. */
export async function returnTask(ctx, id, note = '') {
  const actor = await requireActor(ctx);
  const task = await teamTask(id);
  if (!(await canManageTask(actor, task))) throw forbidden('Only a team admin can return tasks.');
  if (task.status !== 'review') throw badRequest('This task is not waiting for review.');
  const reason = text(note).slice(0, 2000);
  const push = { history: historyEntry(actor, 'returned', reason ? `Returned for changes: ${reason}` : 'Returned for changes') };
  // The record of what was returned keeps who/when/note; the files move to the assignee's draft so they can fix them.
  if (task.turnIn) push.previousTurnIns = { ...task.turnIn, files: [] };
  const updated = await db.tasks.update(id, {
    status: 'in-progress',
    turnIn: null,
    turnInDraft: draftFrom(task.turnIn, 'returned'),
    returned: { note: reason, at: nowISO(), byId: actor.id, byName: actor.name },
  }, { push });
  await logActivity(actor, 'returned task', task.title, { groupId: task.groupId });
  if (task.assigneeId && task.assigneeId !== actor.id) await notify(task.assigneeId, { type: 'return', message: `${actor.name} returned "${task.title}"${reason ? `: ${reason}` : ' for changes.'}`, taskId: id });
  return updated;
}

function checkAssignee(group, assigneeId) {
  if (assigneeId && !isGroupMember(group, assigneeId)) throw badRequest('That person is not in this team.', 'assigneeId');
}

/** Team admin: hand a task to a member (or `null` for Unassigned). */
export async function reassignTask(ctx, id, assigneeId) {
  const actor = await requireActor(ctx);
  const task = await teamTask(id);
  if (!(await canManageTask(actor, task))) throw forbidden('Only a team admin can reassign tasks.');
  need(assigneeId == null || isStr(assigneeId), 'Invalid input.');
  checkAssignee(await db.groups.get(task.groupId), assigneeId);
  if (['done', 'review'].includes(task.status) || (task.assigneeId ?? null) === (assigneeId ?? null)) return task;
  const target = assigneeId ? await nameOfUser(assigneeId) : 'Unassigned';
  const before = task.assigneeId ? await nameOfUser(task.assigneeId) : 'Unassigned';
  const updated = await db.tasks.update(id, { assigneeId: assigneeId ?? null, assignedAt: assigneeId ? nowISO() : null, autoAssigned: false, timerStartedAt: null },
    { push: { history: historyEntry(actor, 'reassigned', `Reassigned from ${before} to ${target}`) } });
  await logActivity(actor, `reassigned task to ${target}`, task.title, { groupId: task.groupId });
  if (assigneeId && assigneeId !== actor.id) await notify(assigneeId, { type: 'assignment', message: `${actor.name} assigned you to "${task.title}".`, taskId: id });
  return updated;
}

/** Team admin: swap the assignees of two tasks of the same team. */
export async function swapTaskAssignees(ctx, idA, idB) {
  const actor = await requireActor(ctx);
  const a = await teamTask(idA);
  const b = await teamTask(idB);
  if (a.groupId !== b.groupId || !(await canManageTask(actor, a))) throw forbidden('Only a team admin can swap tasks.');
  if ([a, b].some((t) => ['done', 'review'].includes(t.status)) || (a.assigneeId ?? null) === (b.assigneeId ?? null)) return;
  const label = async (t) => (t.assigneeId ? nameOfUser(t.assigneeId) : 'Unassigned');
  const [la, lb] = [await label(a), await label(b)];
  await transaction(async () => {
    await db.tasks.update(a.id, { assigneeId: b.assigneeId ?? null, assignedAt: b.assigneeId ? nowISO() : null, autoAssigned: false, timerStartedAt: null }, { push: { history: historyEntry(actor, 'reassigned', `Swapped with "${b.title}": ${la} → ${lb}`) } });
    await db.tasks.update(b.id, { assigneeId: a.assigneeId ?? null, assignedAt: a.assigneeId ? nowISO() : null, autoAssigned: false, timerStartedAt: null }, { push: { history: historyEntry(actor, 'reassigned', `Swapped with "${a.title}": ${lb} → ${la}`) } });
  });
  await logActivity(actor, 'swapped tasks between members', `${a.title} ⇄ ${b.title}`, { groupId: a.groupId });
}

// ---------------------------------------------------------------- projects & milestones

export async function createProject(ctx, input = {}) {
  const actor = await requireActor(ctx);
  const name = text(input.name);
  need(name, 'Project name is required.', 'name');
  let groupId = null;
  if (input.groupId) {
    const group = isStr(input.groupId) ? await db.groups.get(input.groupId) : null;
    if (!group) throw notFound('Team not found.');
    if (!isGroupAdmin(group, actor.id)) throw forbidden('Only a team admin can create team projects.');
    groupId = group.id;
  }
  const project = await db.projects.insert({
    name,
    description: text(input.description),
    status: isStr(input.status) ? input.status : 'planning',
    color: isStr(input.color) ? input.color.slice(0, 20) : 'brand',
    priority: PRIORITIES.includes(input.priority) ? input.priority : 'medium',
    dueDate: isStr(input.dueDate) && DATE_RE.test(input.dueDate) ? input.dueDate : null,
    milestones: [],
    archived: false,
    groupId,
    ownerId: actor.id,
    createdAt: nowISO(),
  });
  await logActivity(actor, 'created project', project.name, { groupId });
  return project;
}

async function managedProject(ctx, id) {
  const actor = await requireActor(ctx);
  const project = await mustProject(id);
  if (!(await canManageProject(actor, project))) throw forbidden('You cannot change this project.');
  return { actor, project };
}

export async function updateProject(ctx, id, patch = {}) {
  const { actor, project } = await managedProject(ctx, id);
  const next = {};
  if (patch.name !== undefined) {
    need(text(patch.name), 'Project name is required.', 'name');
    next.name = text(patch.name);
  }
  if (patch.description !== undefined) next.description = text(patch.description);
  if (isStr(patch.status) && patch.status) next.status = patch.status;
  if (isStr(patch.color) && patch.color) next.color = patch.color.slice(0, 20);
  if (patch.dueDate !== undefined) next.dueDate = isStr(patch.dueDate) && DATE_RE.test(patch.dueDate) ? patch.dueDate : null;
  if (PRIORITIES.includes(patch.priority)) next.priority = patch.priority;
  const updated = await db.projects.update(id, next);
  await logActivity(actor, 'updated project', project.name, { groupId: project.groupId });
  return updated;
}

export async function archiveProject(ctx, id, archived = true) {
  const { project } = await managedProject(ctx, id);
  return db.projects.update(project.id, { archived: Boolean(archived) });
}

/** Deletes a project AND all of its tasks (and their files), as one transaction. */
export async function deleteProject(ctx, id) {
  const { actor, project } = await managedProject(ctx, id);
  await transaction(async () => {
    for (const t of await db.tasks.removeWhere({ projectId: id })) await releaseTaskFiles(t);
    await db.projects.remove(id);
  });
  await logActivity(actor, 'deleted project', project.name, { groupId: project.groupId });
}

export async function addMilestone(ctx, projectId, title, date) {
  await managedProject(ctx, projectId);
  need(text(title), 'Give the milestone a name.', 'title');
  need(isStr(date) && DATE_RE.test(date), 'Pick a date for the milestone.', 'date');
  const milestone = { id: newId(), title: text(title).slice(0, 200), date, done: false };
  await db.projects.update(projectId, {}, { push: { milestones: milestone } });
  return milestone;
}
export async function toggleMilestone(ctx, projectId, milestoneId) {
  const { project } = await managedProject(ctx, projectId);
  const current = (project.milestones || []).find((m) => m.id === milestoneId);
  if (!current) throw notFound('Milestone not found.');
  await db.projects.update(projectId, {}, { patchIn: { milestones: { id: milestoneId, patch: { done: !current.done } } } });
}
export async function removeMilestone(ctx, projectId, milestoneId) {
  await managedProject(ctx, projectId);
  await db.projects.update(projectId, {}, { pull: { milestones: { id: milestoneId } } });
}

// ---------------------------------------------------------------- reminders (personal, date-anchored)

async function ownReminder(ctx, id) {
  const actor = await requireActor(ctx);
  const reminder = await db.reminders.get(id);
  if (!reminder) throw notFound('Reminder not found.');
  if (reminder.ownerId !== actor.id) throw forbidden('That is not your reminder.');
  return { actor, reminder };
}

export async function addReminder(ctx, input = {}) {
  const actor = await requireActor(ctx);
  const title = text(input.title);
  need(title, 'Give the reminder a title.', 'title');
  need(isStr(input.date) && DATE_RE.test(input.date), 'Pick a date for the reminder.', 'date');
  const reminder = await db.reminders.insert({
    title, date: input.date, time: isStr(input.time) ? input.time.slice(0, 5) : '', note: text(input.note).slice(0, 1000), ownerId: actor.id, createdAt: nowISO(),
  });
  await logActivity(actor, 'added reminder', reminder.title, { scope: 'other' });
  return reminder;
}
export async function updateReminder(ctx, id, patch = {}) {
  const { reminder } = await ownReminder(ctx, id);
  const next = {};
  if (patch.title !== undefined) {
    need(text(patch.title), 'Give the reminder a title.', 'title');
    next.title = text(patch.title);
  }
  if (patch.time !== undefined) next.time = isStr(patch.time) ? patch.time.slice(0, 5) : '';
  if (patch.date !== undefined) {
    need(isStr(patch.date) && DATE_RE.test(patch.date), 'Pick a date for the reminder.', 'date');
    next.date = patch.date;
  }
  if (patch.note !== undefined) next.note = text(patch.note).slice(0, 1000);
  return db.reminders.update(reminder.id, next);
}
export async function deleteReminder(ctx, id) {
  await ownReminder(ctx, id);
  await db.reminders.remove(id);
}

// ---------------------------------------------------------------- cascades used by other services

/** A team was disbanded: remove its tasks and projects (and every file they own). */
export async function removeGroupWork(groupId) {
  for (const t of await db.tasks.removeWhere({ groupId })) await releaseTaskFiles(t);
  await db.projects.removeWhere({ groupId });
}

/** A person left or was removed from a team: their unfinished tasks there become Unassigned. */
export async function releaseMemberTasks(groupId, userId, actor = null) {
  const who = await nameOfUser(userId);
  for (const t of await db.tasks.find({ groupId, assigneeId: userId })) {
    if (t.status === 'done') continue;
    await db.tasks.update(t.id, { assigneeId: null, autoAssigned: false, timerStartedAt: null },
      { push: { history: historyEntry(actor, 'reassigned', `${who} left the team — task is unassigned`) } });
  }
}

/** An account was deleted: remove what only they owned and free their team tasks. */
export async function removeUserWork(userId) {
  const who = await nameOfUser(userId);
  for (const t of await db.tasks.removeWhere({ ownerId: userId, groupId: null })) await releaseTaskFiles(t);
  await db.projects.removeWhere({ ownerId: userId, groupId: null });
  await db.reminders.removeWhere({ ownerId: userId });
  for (const t of await db.tasks.find({ assigneeId: userId })) {
    if (!t.groupId || t.status === 'done') continue;
    await db.tasks.update(t.id, { assigneeId: null, autoAssigned: false, timerStartedAt: null },
      { push: { history: historyEntry(null, 'reassigned', `${who}'s account was deleted — task is unassigned`) } });
  }
}
