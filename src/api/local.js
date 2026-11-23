import { userIdForToken } from './session.js';
import * as auth from './services/authService.js';
import * as tasks from './services/taskService.js';
import * as teams from './services/teamService.js';
import * as notifications from './services/notificationService.js';
import * as activity from './services/activityService.js';
import * as files from './services/fileService.js';
import { bootstrap } from './services/syncService.js';

/**
 * The IN-PROCESS implementation of the data layer (browser demo / tests): runs the services right here
 * against the in-memory repository. `http.js` is the networked twin; `index.js` picks one.
 *
 * Every call is ASYNC and returns plain JSON (or throws an `ApiError`), exactly like a network
 * request would. The browser demo runs the services in-process against the in-memory repository;
 * the Node backend exposes the same operations as Express routes (see docs/API_CONTRACT.md), and
 * only this file changes: each function becomes `fetch('/api/...')`.
 *
 * Who is calling comes from the session token held here (an httpOnly cookie / Authorization
 * header in a real deployment) and is passed to services as `ctx` — never taken from arguments.
 */
let token = null;
const ctx = async () => ({ actorId: await userIdForToken(token) });

/** Binds a service function to the current session: `fn(ctx, ...args)` -> `async (...args)`. */
const bind = (fn) => async (...args) => fn(await ctx(), ...args);
const bindAll = (module, names) => Object.fromEntries(names.map((n) => [n, bind(module[n])]));

export const localApi = {
  /** POST /api/auth/register · /login · /logout · PATCH /api/me · ... */
  auth: {
    register: async (input) => auth.register(input),
    // `login` and `verifyEmailCode` start the session; `login` answers a challenge instead when an emailed code is needed.
    login: async (input) => {
      const result = await auth.login(input);
      if (result.codeRequired) return result;
      token = result.token;
      return result.user;
    },
    verifyEmailCode: async (input) => {
      const { user, token: t } = await auth.verifyEmailCode(input);
      token = t;
      return user;
    },
    resendEmailCode: async (input) => auth.resendEmailCode(input),
    getEmailCodeConfig: async () => auth.getEmailCodeConfig(),
    logout: async () => {
      await auth.logout(await ctx(), token);
      token = null;
    },
    loginWithGoogle: async (input) => {
      const { user, token: t } = await auth.loginWithGoogle(input);
      token = t;
      return user;
    },
    getGoogleConfig: async () => auth.getGoogleConfig(),
    requestPasswordReset: async (input) => auth.requestPasswordReset(input),
    resetPassword: async (input) => auth.resetPassword(input),
    ...bindAll(auth, ['getMe', 'updateProfile', 'changePassword', 'setAccountRole', 'setAccountStatus', 'deleteUser', 'getSettings', 'updateSettings']),
  },
  /** GET /api/bootstrap */
  bootstrap: bind(bootstrap),
  /** /api/tasks, /api/projects, /api/reminders */
  tasks: bindAll(tasks, [
    'createTask', 'createTeamTasks', 'updateTask', 'deleteTask', 'deleteTasks', 'moveTaskStatus',
    'addSubtask', 'toggleSubtask', 'removeSubtask', 'addComment', 'addAttachment', 'removeAttachment',
    'addTimeEntry', 'setEstimate', 'startTimer', 'stopTimer',
    'moveTeamTask', 'turnInTask', 'saveTurnInDraft', 'undoTurnIn', 'approveTask', 'returnTask', 'reassignTask', 'swapTaskAssignees',
    'createProject', 'updateProject', 'archiveProject', 'deleteProject', 'addMilestone', 'toggleMilestone', 'removeMilestone',
    'addReminder', 'updateReminder', 'deleteReminder',
  ]),
  /** /api/teams/... */
  teams: bindAll(teams, [
    'createGroup', 'updateGroup', 'deleteGroup', 'regenerateInviteCode',
    'joinByCode', 'joinPublicGroup', 'approveJoinRequest', 'declineJoinRequest', 'cancelJoinRequest',
    'kickMember', 'promoteMember', 'demoteMember', 'leaveGroup',
    'addRole', 'removeRole', 'proposeRoleChange', 'answerRoleChange', 'cancelRoleChange',
    'postTeamAnnouncement', 'deleteTeamAnnouncement',
    'listMessages', 'sendMessage', 'reactToMessage', 'deleteMessage',
  ]),
  /** /api/notifications */
  notifications: bindAll(notifications, ['markNotificationRead', 'markAllNotificationsRead', 'clearNotifications', 'acknowledgePopups', 'syncDeadlines']),
  /** /api/activity */
  activity: bindAll(activity, ['listMyActivity', 'listAllActivity', 'logAccess']),
  /** POST /api/files (multipart) */
  files: bindAll(files, ['uploadFile', 'deleteFile']),
};

