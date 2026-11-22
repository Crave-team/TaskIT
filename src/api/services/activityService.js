import { db } from '../repo.js';
import { requireActor, requireSiteAdmin, logActivity, cleanPage } from '../core.js';
import { makeNamer, populateActivity } from '../views.js';
import { config } from '../config.js';
import { badRequest } from '../errors.js';

/**
 * The audit trail. Members see their own actions; the site admin sees everything (including
 * page visits and sign-ins). Both are paginated newest-first with a `before` cursor.
 */

const view = async (rows) => {
  // Names are looked up for just the people in this page (not the whole user table).
  const ids = [...new Set(rows.map((r) => r.actorId).filter(Boolean))];
  const nameOf = makeNamer(ids.length ? await db.users.find({ id: { $in: ids } }) : []);
  return rows.map((r) => populateActivity(r, nameOf));
};

/** The caller's own actions (never page visits). */
export async function listMyActivity(ctx, options = {}) {
  const actor = await requireActor(ctx);
  const { limit, before } = cleanPage(options, 200, config.PAGE_SIZE);
  // Page visits are excluded IN the query, so they can never crowd real actions out of the page.
  return view(await db.activity.page({ actorId: actor.id, kind: { $ne: 'access' } }, { limit, before }));
}

/** Site admin: everything, optionally narrowed by scope or person. */
export async function listAllActivity(ctx, options = {}) {
  await requireSiteAdmin(ctx);
  const { limit, before } = cleanPage(options, 1000, config.PAGE_SIZE);
  const { scope, actorId } = options;
  const filter = {};
  if (typeof scope === 'string' && scope !== 'all') filter.scope = scope;
  if (typeof actorId === 'string' && actorId) filter.actorId = actorId;
  return view(await db.activity.page(filter, { limit, before }));
}

/** Records that the caller opened a page/team (shown only on the admin's Activity Log). */
export async function logAccess(ctx, { action, target, scope = 'other' } = {}) {
  const actor = await requireActor(ctx);
  if (typeof action !== 'string' || typeof target !== 'string') throw badRequest('Invalid input.');
  if (!['workspace', 'team', 'account', 'other'].includes(scope)) scope = 'other';
  await logActivity(actor, action, target, { scope, kind: 'access' });
}
