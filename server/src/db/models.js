import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Mongoose schemas. Design choices:
 *  - `_id` is the 24-hex STRING our data layer generates (ordered by creation, ObjectId-compatible), and
 *    every reference (`ownerId`, `groupId`...) is the same kind of string, so services compare ids directly.
 *  - `strict: 'throw'` : writing a field a schema doesn't declare is an error, not silent data loss.
 *  - Embedded lists whose items have an `id` (subtasks, comments, history...) are stored as arrays of
 *    plain objects and changed with atomic $push / $pull / arrayFilters (see mongoRepo.js).
 */
const base = { versionKey: false, minimize: false, strict: 'throw' };
const str = (extra = {}) => ({ type: String, ...extra });
const ref = (extra = {}) => ({ type: String, default: null, index: true, ...extra });
const list = () => ({ type: [Schema.Types.Mixed], default: [] });

const make = (name, collection, definition, indexes = []) => {
  const schema = new Schema({ _id: String, ...definition }, { ...base, collection });
  indexes.forEach(([fields, options]) => schema.index(fields, options));
  return mongoose.models[name] || mongoose.model(name, schema);
};

export const models = {
  users: make('User', 'users', {
    name: str({ required: true }),
    email: str({ required: true, unique: true }),
    // null for accounts that only sign in with Google (they can set a password later).
    passwordHash: str({ default: null }),
    // Google's stable subject id. Left ABSENT (not null) for everyone else, so the partial unique index below ignores them.
    googleId: str(),
    accountRole: str({ enum: ['user', 'admin'], default: 'user' }),
    title: str({ default: '' }),
    status: str({ enum: ['active', 'suspended'], default: 'active' }),
    prefs: { dueReminders: { type: Boolean, default: true }, dailyDigest: { type: Boolean, default: true }, mentions: { type: Boolean, default: true } },
    avatarUrl: str({ default: null }),
    avatarFileId: str({ default: null }),
    avatarColor: str({ default: 'brand' }),
    twoFactor: { type: Boolean, default: false },
    tourPending: { type: Boolean, default: false },
    createdAt: str({ required: true }),
  }, [[{ googleId: 1 }, { unique: true, partialFilterExpression: { googleId: { $type: 'string' } } }]]),

  groups: make('Group', 'groups', {
    name: str({ required: true }),
    description: str({ default: '' }),
    visibility: str({ enum: ['public', 'private'], default: 'public' }),
    ownerId: str({ required: true }),
    adminIds: { type: [String], default: [] },
    memberIds: { type: [String], default: [], index: true },
    inviteCode: str({ required: true, unique: true }),
    // Roles the team's admins define: [{ id, name }]. `memberRoles` maps a member's id to the id of the ONE role they hold.
    roles: list(),
    memberRoles: { type: Schema.Types.Mixed, default: {} },
    createdAt: str({ required: true }),
  }, [[{ visibility: 1 }, {}]]),

  // A sign-in or sign-up waiting for its emailed 6-digit code. Only HASHES are stored (of the challenge token and of
  // the code), and `pending` holds the not-yet-created account of a sign-up. Short-lived; the service deletes stale ones.
  authChallenges: make('AuthChallenge', 'authchallenges', {
    tokenHash: str({ required: true }),
    purpose: str({ required: true }),
    email: str({ required: true }),
    userId: str({ default: null }),
    pending: { type: Schema.Types.Mixed, default: null },
    expectedRole: str({ default: null }),
    codeHash: str({ required: true }),
    codeSalt: str({ required: true }),
    expiresAt: str({ required: true }),
    attempts: { type: Number, default: 0 },
    sends: { type: Number, default: 1 },
    lastSentAt: str({ required: true }),
    createdAt: str({ required: true }),
  }, [[{ tokenHash: 1 }, { unique: true }], [{ email: 1, createdAt: 1 }, {}]]),

  joinRequests: make('JoinRequest', 'joinrequests', {
    groupId: str({ required: true }),
    accountId: str({ required: true, index: true }),
    // The role the requester picked from the team's list ('' when the team had no roles).
    roleId: str({ default: '' }),
    createdAt: str({ required: true }),
  }, [[{ groupId: 1, accountId: 1 }, { unique: true }]]),

  // An admin's proposal to change a member's role. It only takes effect once the member accepts.
  roleChanges: make('RoleChange', 'rolechanges', {
    groupId: str({ required: true }),
    accountId: str({ required: true, index: true }),
    roleId: str({ required: true }),
    requestedById: str({ required: true }),
    createdAt: str({ required: true }),
  }, [[{ groupId: 1, accountId: 1 }, { unique: true }]]),

  messages: make('Message', 'messages', {
    groupId: str({ required: true }),
    authorId: str({ required: true }),
    text: str({ default: '' }),
    image: { type: Schema.Types.Mixed, default: null },
    replyTo: str({ default: null }),
    reactions: { type: Schema.Types.Mixed, default: {} },
    deleted: { type: Boolean, default: false },
    deletedBy: str({ default: null }),
    createdAt: str({ required: true }),
  }, [[{ groupId: 1, _id: -1 }, {}]]),

  teamAnnouncements: make('TeamAnnouncement', 'teamannouncements', {
    groupId: ref({ required: true }),
    authorId: str({ required: true }),
    text: str({ required: true }),
    createdAt: str({ required: true }),
  }),

  projects: make('Project', 'projects', {
    name: str({ required: true }),
    description: str({ default: '' }),
    status: str({ default: 'planning' }),
    color: str({ default: 'brand' }),
    priority: str({ enum: ['low', 'medium', 'high'], default: 'medium' }),
    dueDate: str({ default: null }),
    milestones: list(),
    archived: { type: Boolean, default: false },
    groupId: ref(),
    ownerId: ref({ required: true }),
    createdAt: str({ required: true }),
  }),

  tasks: make('Task', 'tasks', {
    title: str({ required: true }),
    description: str({ default: '' }),
    priority: str({ enum: ['low', 'medium', 'high'], default: 'medium' }),
    status: str({ enum: ['todo', 'in-progress', 'review', 'done'], default: 'todo' }),
    dueDate: str({ required: true, index: true }),
    tags: { type: [String], default: [] },
    recurrence: str({ default: 'none' }),
    projectId: ref({ required: true }),
    groupId: ref(),
    ownerId: ref({ required: true }),
    assigneeId: ref(),
    // The team role the task was created for (its assignee was picked among that role's holders); null on personal tasks.
    roleId: str({ default: null }),
    roleName: str({ default: null }),
    autoAssigned: { type: Boolean, default: false },
    assignedAt: str({ default: null }),
    subtasks: list(),
    comments: list(),
    attachments: list(),
    timeEntries: list(),
    estimatedMinutes: { type: Number, default: 0 },
    dependsOn: { type: [String], default: [] },
    history: list(),
    turnIn: { type: Schema.Types.Mixed, default: null },
    turnInDraft: { type: Schema.Types.Mixed, default: null },
    returned: { type: Schema.Types.Mixed, default: null },
    previousTurnIns: list(),
    completedAt: str({ default: null }),
    timerStartedAt: { type: Number, default: null },
    createdAt: str({ required: true }),
  }, [
    [{ 'attachments.fileId': 1 }, { sparse: true }],
    [{ 'turnIn.files.fileId': 1 }, { sparse: true }],
    [{ 'turnInDraft.files.fileId': 1 }, { sparse: true }],
  ]),

  reminders: make('Reminder', 'reminders', {
    title: str({ required: true }),
    date: str({ required: true }),
    time: str({ default: '' }),
    note: str({ default: '' }),
    ownerId: str({ required: true }),
    createdAt: str({ required: true }),
  }, [[{ ownerId: 1, date: 1 }, {}]]),

  notifications: make('Notification', 'notifications', {
    recipientId: str({ required: true }),
    type: str({ required: true }),
    message: str({ required: true }),
    taskId: str({ default: null }),
    link: str({ default: null }),
    dedupeKey: str({ default: null }),
    // One notice per person per key: unique + sparse, and only set when there is a key.
    dedupeId: str({ unique: true, sparse: true }),
    popup: { type: Schema.Types.Mixed, default: null },
    read: { type: Boolean, default: false },
    createdAt: str({ required: true }),
  }, [[{ recipientId: 1, _id: -1 }, {}]]),

  activity: make('Activity', 'activity', {
    kind: str({ default: 'action' }),
    scope: str({ default: 'workspace' }),
    actorId: str({ default: null }),
    actorName: str({ default: 'System' }),
    action: str({ required: true }),
    target: str({ default: '' }),
    groupId: str({ default: null }),
    createdAt: str({ required: true }),
  }, [[{ actorId: 1, _id: -1 }, {}], [{ scope: 1, _id: -1 }, {}]]),

  files: make('File', 'files', {
    ownerId: ref({ required: true }),
    name: str({ required: true }),
    size: { type: Number, default: 0 },
    mime: str({ default: 'application/octet-stream' }),
    url: str({ required: true }),
    createdAt: str({ required: true }),
  }),
};

/** Server-side sessions: `_id` is the SHA-256 of the cookie token (the token itself is never stored). */
const sessionSchema = new Schema({
  _id: String,
  userId: { type: String, required: true, index: true },
  createdAt: { type: Date, required: true },
  lastSeenAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
}, { versionKey: false, strict: 'throw', collection: 'sessions' });
// MongoDB deletes the document itself once `expiresAt` passes (TTL index). Servers that lack TTL indexes
// (e.g. the FerretDB used in tests) set MONGO_SKIP_TTL=true; expiry is ALSO checked on every request.
sessionSchema.index({ expiresAt: 1 }, process.env.MONGO_SKIP_TTL === 'true' ? {} : { expireAfterSeconds: 0 });
export const SessionModel = mongoose.models.Session || mongoose.model('Session', sessionSchema);

/** The single site-settings document. */
export const SettingsModel = mongoose.models.Setting || mongoose.model('Setting', new Schema({
  _id: String,
  require2fa: Boolean,
  notifyDeadlines: Boolean, sessionTimeout: String,
}, { versionKey: false, strict: 'throw', collection: 'settings' }));

export { mongoose };
