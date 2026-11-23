/**
 * The HTTP contract: ONE table, used by both sides.
 *   - the Express server turns each row into a route that calls `services/<area>Service.<fn>`;
 *   - the browser's HTTP client (`http.js`) turns the same row into a `fetch` call.
 * Because they read the same table they cannot disagree about a path, method or argument.
 *
 * `args` lists the service function's arguments after `ctx`, in order. Where each one travels:
 *   a name that appears in the path (`:id`)  -> URL parameter
 *   '$body'                                   -> the whole JSON body is that (object) argument
 *   '$query'                                  -> the whole query string is that (object) argument
 *   any other name                            -> `body[name]` (POST/PUT/PATCH) or `?name=` (GET/DELETE)
 */
const r = (method, path, args = [], extra = {}) => ({ method, path, args, ...extra });

export const routes = {
  // ---- accounts & sign-in -------------------------------------------------------------------
  // `noCtx`: nobody is signed in yet, so these services take no caller argument.
  'auth.register': r('POST', '/auth/register', ['$body'], { public: true, noCtx: true, limit: 'auth' }),
  'auth.login': r('POST', '/auth/login', ['$body'], { public: true, limit: 'auth' }),
  'auth.logout': r('POST', '/auth/logout'),
  // Sign in / sign up with a Google ID token. `googleConfig` tells the browser whether (and with which client id) to show the button.
  'auth.getGoogleConfig': r('GET', '/auth/google/config', [], { public: true, noCtx: true }),
  'auth.loginWithGoogle': r('POST', '/auth/google', ['$body'], { public: true, limit: 'auth' }),
  // Email codes: the 6-digit second step of signing in / up. `login` and `register` answer `{ codeRequired: true, challengeToken }`
  // when a code is needed; `verifyEmailCode` finishes it (and starts the session), `resendEmailCode` sends a fresh code.
  'auth.getEmailCodeConfig': r('GET', '/auth/code/config', [], { public: true, noCtx: true }),
  'auth.verifyEmailCode': r('POST', '/auth/code/verify', ['$body'], { public: true, noCtx: true, limit: 'auth' }),
  'auth.resendEmailCode': r('POST', '/auth/code/resend', ['$body'], { public: true, noCtx: true, limit: 'auth' }),
  'auth.requestPasswordReset': r('POST', '/auth/forgot', ['$body'], { public: true, noCtx: true, limit: 'auth' }),
  'auth.resetPassword': r('POST', '/auth/forgot/verify', ['$body'], { public: true, noCtx: true, limit: 'auth' }),
  'auth.getMe': r('GET', '/me'),
  'auth.updateProfile': r('PATCH', '/me', ['$body']),
  'auth.changePassword': r('POST', '/me/password', ['$body'], { limit: 'auth' }),
  'auth.getSettings': r('GET', '/settings'),

  // ---- site admin ---------------------------------------------------------------------------
  'auth.setAccountRole': r('PUT', '/admin/users/:userId/role', ['userId', 'accountRole']),
  'auth.setAccountStatus': r('PUT', '/admin/users/:userId/status', ['userId', 'status']),
  'auth.deleteUser': r('DELETE', '/admin/users/:userId', ['userId']),
  'auth.updateSettings': r('PATCH', '/admin/settings', ['$body']),
  'activity.listAllActivity': r('GET', '/admin/activity', ['$query']),

  // ---- everything the signed-in person may see ------------------------------------------------
  bootstrap: r('GET', '/bootstrap', ['$query'], { public: true }),

  // ---- tasks --------------------------------------------------------------------------------
  'tasks.createTask': r('POST', '/tasks', ['input', 'options']),
  'tasks.createTeamTasks': r('POST', '/projects/:projectId/team-tasks', ['projectId', 'rows']),
  'tasks.updateTask': r('PATCH', '/tasks/:id', ['id', '$body']),
  'tasks.deleteTask': r('DELETE', '/tasks/:id', ['id']),
  'tasks.deleteTasks': r('POST', '/tasks/bulk-delete', ['ids']),
  'tasks.moveTaskStatus': r('PUT', '/tasks/:id/status', ['id', 'status']),
  'tasks.addSubtask': r('POST', '/tasks/:id/subtasks', ['id', 'title']),
  'tasks.toggleSubtask': r('POST', '/tasks/:id/subtasks/:subtaskId/toggle', ['id', 'subtaskId']),
  'tasks.removeSubtask': r('DELETE', '/tasks/:id/subtasks/:subtaskId', ['id', 'subtaskId']),
  'tasks.addComment': r('POST', '/tasks/:id/comments', ['id', 'text', 'options']),
  'tasks.addAttachment': r('POST', '/tasks/:id/attachments', ['id', '$body']),
  'tasks.removeAttachment': r('DELETE', '/tasks/:id/attachments/:attachmentId', ['id', 'attachmentId']),
  'tasks.addTimeEntry': r('POST', '/tasks/:id/time', ['id', 'minutes', 'note']),
  'tasks.setEstimate': r('PUT', '/tasks/:id/estimate', ['id', 'minutes']),
  'tasks.startTimer': r('POST', '/tasks/:id/timer/start', ['id']),
  'tasks.stopTimer': r('POST', '/tasks/:id/timer/stop', ['id', 'note']),

  // ---- team task workflow -------------------------------------------------------------------
  'tasks.moveTeamTask': r('PUT', '/tasks/:id/team-status', ['id', 'status']),
  'tasks.turnInTask': r('POST', '/tasks/:id/turn-in', ['id', '$body']),
  'tasks.undoTurnIn': r('DELETE', '/tasks/:id/turn-in', ['id']),
  'tasks.saveTurnInDraft': r('PUT', '/tasks/:id/turn-in', ['id', '$body']),
  'tasks.approveTask': r('POST', '/tasks/:id/approve', ['id']),
  'tasks.returnTask': r('POST', '/tasks/:id/return', ['id', 'note']),
  'tasks.reassignTask': r('PUT', '/tasks/:id/assignee', ['id', 'assigneeId']),
  'tasks.swapTaskAssignees': r('POST', '/tasks/swap', ['idA', 'idB']),

  // ---- projects & milestones ----------------------------------------------------------------
  'tasks.createProject': r('POST', '/projects', ['$body']),
  'tasks.updateProject': r('PATCH', '/projects/:id', ['id', '$body']),
  'tasks.archiveProject': r('POST', '/projects/:id/archive', ['id', 'archived']),
  'tasks.deleteProject': r('DELETE', '/projects/:id', ['id']),
  'tasks.addMilestone': r('POST', '/projects/:id/milestones', ['id', 'title', 'date']),
  'tasks.toggleMilestone': r('POST', '/projects/:id/milestones/:milestoneId/toggle', ['id', 'milestoneId']),
  'tasks.removeMilestone': r('DELETE', '/projects/:id/milestones/:milestoneId', ['id', 'milestoneId']),

  // ---- reminders ----------------------------------------------------------------------------
  'tasks.addReminder': r('POST', '/reminders', ['$body']),
  'tasks.updateReminder': r('PATCH', '/reminders/:id', ['id', '$body']),
  'tasks.deleteReminder': r('DELETE', '/reminders/:id', ['id']),

  // ---- teams --------------------------------------------------------------------------------
  'teams.createGroup': r('POST', '/teams', ['$body']),
  'teams.updateGroup': r('PATCH', '/teams/:id', ['id', '$body']),
  'teams.deleteGroup': r('DELETE', '/teams/:id', ['id']),
  'teams.regenerateInviteCode': r('POST', '/teams/:id/invite-code', ['id']),
  'teams.joinByCode': r('POST', '/teams/join', ['code', 'roleId']),
  'teams.joinPublicGroup': r('POST', '/teams/:id/join', ['id', 'roleId']),
  'teams.approveJoinRequest': r('POST', '/join-requests/:id/approve', ['id']),
  'teams.declineJoinRequest': r('POST', '/join-requests/:id/decline', ['id']),
  'teams.cancelJoinRequest': r('DELETE', '/teams/:id/join-request', ['id']),
  'teams.kickMember': r('DELETE', '/teams/:id/members/:userId', ['id', 'userId']),
  'teams.promoteMember': r('PUT', '/teams/:id/admins/:userId', ['id', 'userId']),
  'teams.demoteMember': r('DELETE', '/teams/:id/admins/:userId', ['id', 'userId']),
  'teams.addRole': r('POST', '/teams/:id/roles', ['id', 'name']),
  'teams.removeRole': r('DELETE', '/teams/:id/roles/:roleId', ['id', 'roleId']),
  'teams.proposeRoleChange': r('PUT', '/teams/:id/members/:userId/role', ['id', 'userId', 'roleId']),
  'teams.answerRoleChange': r('POST', '/role-changes/:id/answer', ['id', 'accept']),
  'teams.cancelRoleChange': r('DELETE', '/role-changes/:id', ['id']),
  'teams.leaveGroup': r('POST', '/teams/:id/leave', ['id']),
  'teams.postTeamAnnouncement': r('POST', '/teams/:id/announcements', ['id', 'text']),
  'teams.deleteTeamAnnouncement': r('DELETE', '/announcements/:id', ['id']),
  'teams.listMessages': r('GET', '/teams/:id/messages', ['id', '$query']),
  'teams.sendMessage': r('POST', '/teams/:id/messages', ['id', '$body']),
  'teams.reactToMessage': r('PUT', '/messages/:id/reaction', ['id', 'emoji']),
  'teams.deleteMessage': r('DELETE', '/messages/:id', ['id']),

  // ---- notifications & activity -----------------------------------------------------------------
  'notifications.markNotificationRead': r('POST', '/notifications/:id/read', ['id']),
  'notifications.markAllNotificationsRead': r('POST', '/notifications/read-all'),
  'notifications.clearNotifications': r('DELETE', '/notifications'),
  'notifications.acknowledgePopups': r('POST', '/notifications/acknowledge', ['ids']),
  'notifications.syncDeadlines': r('POST', '/notifications/sync-deadlines', ['$body']),
  'activity.listMyActivity': r('GET', '/activity/mine', ['$query']),
  'activity.logAccess': r('POST', '/activity/access', ['$body']),

  // ---- files (upload is multipart and handled specially; see the server and http.js) ------------
  'files.uploadFile': r('POST', '/files', ['file'], { multipart: true }),
  'files.deleteFile': r('DELETE', '/files/:id', ['id']),
};

/** Splits `'tasks.createTask'` into `['tasks', 'createTask']`; `bootstrap` has no area. */
export const splitName = (name) => (name.includes('.') ? name.split('.') : [null, name]);
