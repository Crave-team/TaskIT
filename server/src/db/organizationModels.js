import mongoose from 'mongoose';
import { make, str, appendOnly } from './schemaKit.js';

const { Schema } = mongoose;

/** Organization-level roles (who you are across the whole organization). */
export const ORG_ROLES = ['owner', 'manager', 'member'];
/** Unit-level roles (what you are inside one unit). The Owner may also lead a unit. */
export const UNIT_ROLES = ['leader', 'assistant', 'member'];
export const REVIEW_STATES = ['none', 'submitted', 'returned', 'approved'];
export const REVIEW_ACTIONS = ['submit', 'withdraw', 'approve', 'return', 'escalate', 'deadline_override', 'handoff_accept', 'handoff_return'];
export const REVIEWER_ROLES = ['author', 'assistant', 'leader', 'manager', 'system'];
export const HANDOFF_STATES = ['pending', 'accepted', 'returned'];
/** Deepest allowed unit tree (enforced by the service; kept here so tests and services share one number). */
export const MAX_UNIT_DEPTH = 8;
/** Rule from the spec: an Assistant may return an item at most this many times before it must go to the Leader. */
export const MAX_ASSISTANT_RETURNS = 2;

const nullableEnum = (values) => ({ type: String, enum: [...values, null], default: null });

/**
 * New and replacement collections of the Organization module. They replace `groups`; the fields that change on
 * existing collections (tasks, projects, messages, ...) are listed in docs/ORGANIZATION_DATA_MODEL.md and are applied
 * to models.js together with the services that use them.
 */
export const organizationModels = {
  // Replaces `groups`. The `_id` of a migrated group is kept, so every old groupId value is a valid orgId.
  organizations: make('Organization', 'organizations', {
    name: str({ required: true }),
    description: str({ default: '' }),
    visibility: str({ enum: ['public', 'private'], default: 'public' }),
    ownerId: str({ required: true }),
    inviteCode: str({ required: true, unique: true }),
    // Job roles, role assignments and admin list of the old team model, kept so the migration loses nothing.
    legacy: { type: Schema.Types.Mixed, default: null },
    createdAt: str({ required: true }),
  }, [[{ visibility: 1 }, {}], [{ ownerId: 1 }, {}]]),

  // One row per (organization, person): organization role plus the person's place in the unit tree.
  orgMembers: make('OrgMember', 'orgmembers', {
    orgId: str({ required: true }),
    userId: str({ required: true }),
    role: str({ enum: ORG_ROLES, default: 'member' }),
    unitId: str({ default: null }),
    unitRole: nullableEnum(UNIT_ROLES),
    joinedAt: str({ required: true }),
  }, [
    [{ orgId: 1, userId: 1 }, { unique: true }],
    [{ userId: 1 }, {}],
    [{ orgId: 1, unitId: 1 }, {}],
    // Exactly one Owner per organization, and at most one Leader per unit, enforced by the database.
    [{ orgId: 1 }, { unique: true, partialFilterExpression: { role: 'owner' }, name: 'one_owner_per_org' }],
    [{ orgId: 1, unitId: 1 }, { unique: true, partialFilterExpression: { unitRole: 'leader' }, name: 'one_leader_per_unit' }],
  ]),

  // The owner-defined recursive tree. `path` lists the ancestor ids from the top down, so "everything under X" is one query.
  orgUnits: make('OrgUnit', 'orgunits', {
    orgId: str({ required: true }),
    parentId: str({ default: null }),
    name: str({ required: true }),
    nameKey: str({ required: true }),
    path: { type: [String], default: [] },
    depth: { type: Number, default: 0, min: 0, max: MAX_UNIT_DEPTH - 1 },
    createdById: str({ default: null }),
    createdAt: str({ required: true }),
  }, [
    [{ orgId: 1, parentId: 1, nameKey: 1 }, { unique: true }],
    [{ orgId: 1, path: 1 }, {}],
  ]),

  // Append-only review log. `seq` is 1, 2, 3... per task, and the unique (taskId, seq) index means two people acting
  // on the same item at the same moment cannot both succeed: the second insert is rejected.
  reviews: make('Review', 'reviews', {
    orgId: str({ required: true }),
    taskId: str({ required: true }),
    seq: { type: Number, required: true, min: 1 },
    action: str({ required: true, enum: REVIEW_ACTIONS }),
    authorId: str({ required: true }),
    actorId: str({ default: null }),
    actorRole: str({ required: true, enum: REVIEWER_ROLES }),
    unitId: str({ default: null }),
    fromHolderId: str({ default: null }),
    toHolderId: str({ default: null }),
    handoffId: str({ default: null }),
    note: str({ default: '', maxlength: 2000 }),
    createdAt: str({ required: true }),
  }, [
    [{ taskId: 1, seq: 1 }, { unique: true }],
    [{ orgId: 1, unitId: 1, _id: -1 }, {}],
  ], (schema) => {
    appendOnly(schema);
    // Backstop for "a reviewer never reviews their own item" (the service enforces it first).
    schema.pre('validate', function noSelfReview() {
      if (['approve', 'return', 'escalate'].includes(this.action) && this.actorId && this.actorId === this.authorId) {
        this.invalidate('actorId', 'A reviewer cannot review their own item.');
      }
    });
  }),

  // Evaluation, part 1: facts the system computes from tasks and reviews, one row per unit and month (YYYY-MM).
  orgEvaluationFacts: make('OrgEvaluationFact', 'orgevaluationfacts', {
    orgId: str({ required: true }),
    unitId: str({ required: true }),
    period: str({ required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/ }),
    tasksAssigned: { type: Number, default: 0, min: 0 },
    tasksApproved: { type: Number, default: 0, min: 0 },
    tasksOnTime: { type: Number, default: 0, min: 0 },
    tasksLate: { type: Number, default: 0, min: 0 },
    returns: { type: Number, default: 0, min: 0 },
    deadlineOverrides: { type: Number, default: 0, min: 0 },
    avgApprovalHours: { type: Number, default: 0, min: 0 },
    computedAt: str({ required: true }),
  }, [[{ orgId: 1, unitId: 1, period: 1 }, { unique: true }]]),

  // Evaluation, part 2: anonymous manager ratings. There is deliberately NO evaluator id and NO timestamp here.
  // `raterKey` is a keyed hash (computed by the service) that only blocks a second rating by the same person for the
  // same unit and month; it is not a readable link to the evaluator. Ids of these rows must be random, not time-ordered.
  orgRatings: make('OrgRating', 'orgratings', {
    orgId: str({ required: true }),
    unitId: str({ required: true }),
    period: str({ required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/ }),
    raterKey: str({ required: true }),
    score: { type: Number, required: true, min: 1, max: 5, validate: Number.isInteger },
  }, [
    [{ orgId: 1, unitId: 1, period: 1, raterKey: 1 }, { unique: true }],
    [{ orgId: 1, unitId: 1, period: 1 }, {}],
  ], appendOnly),

  // Handoff routes: an owner-defined ordered list of units that finished work travels through.
  orgHandoffTemplates: make('OrgHandoffTemplate', 'orghandofftemplates', {
    orgId: str({ required: true }),
    name: str({ required: true }),
    steps: { type: [new Schema({ unitId: { type: String, required: true } }, { _id: false, strict: 'throw' })], default: [] },
    active: { type: Boolean, default: true },
    createdById: str({ required: true }),
    createdAt: str({ required: true }),
    updatedAt: str({ required: true }),
  }, [[{ orgId: 1, active: 1 }, {}]]),

  // One handoff of one task from one unit to the next. The unit ids are copied from the template when it is created,
  // so editing the template later does not change handoffs already in flight.
  orgHandoffs: make('OrgHandoff', 'orghandoffs', {
    orgId: str({ required: true }),
    templateId: str({ required: true }),
    taskId: str({ required: true }),
    stepIndex: { type: Number, required: true, min: 0 },
    fromUnitId: str({ required: true }),
    toUnitId: str({ required: true }),
    senderId: str({ required: true }),
    state: str({ enum: HANDOFF_STATES, default: 'pending' }),
    decidedById: str({ default: null }),
    decidedAt: str({ default: null }),
    createdAt: str({ required: true }),
  }, [
    [{ orgId: 1, toUnitId: 1, state: 1 }, {}],
    [{ taskId: 1 }, {}],
  ]),
};
