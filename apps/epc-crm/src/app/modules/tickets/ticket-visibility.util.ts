import { ForbiddenException } from '@nestjs/common';
import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';

export const LEAD_CLAIMS = {
  viewAll: 'tickets.view_all_leads',
  viewOnlyAssigned: 'tickets.view_only_assigned_to_me',
  postAnyLead: 'ticket_replies.post_any_lead',
} as const;

export enum LeadAccess {
  ALL = 'all',
  ASSIGNED = 'assigned',
  NONE = 'none',
}

export type LeadScopeUser =
  | {
      id?: string;
      userType?: string;
      permissions?: string[];
    }
  | null
  | undefined;

/** Anything that can run a raw SQL query (DataSource, EntityManager). */
type QueryRunner = { query: (sql: string, params?: any[]) => Promise<any> };

const normalize = (claim: string) => claim.replace(/:/g, '.').trim();

export function hasClaim(user: LeadScopeUser, claim: string): boolean {
  const wanted = normalize(claim);
  return (user?.permissions ?? []).some((c) => normalize(c) === wanted);
}

/**
 * Resolves which leads a user may see inside the projects they belong to.
 * - view_all_leads (alone or with view_only_assigned_to_me) -> every lead
 * - only view_only_assigned_to_me -> leads the user is assigned to, created,
 *   or has been mentioned on (see leadVisibilityPredicate)
 * - neither -> no leads
 * External (client) users keep their existing behaviour.
 */
export function getLeadAccess(user: LeadScopeUser): LeadAccess {
  if (!user) return LeadAccess.NONE;
  if (user.userType === 'EXTERNAL') return LeadAccess.ALL;

  if (hasClaim(user, LEAD_CLAIMS.viewAll)) return LeadAccess.ALL;
  if (hasClaim(user, LEAD_CLAIMS.viewOnlyAssigned)) return LeadAccess.ASSIGNED;
  return LeadAccess.NONE;
}

/**
 * SQL predicate for "this lead is visible to an assigned-only user":
 *  - the user is the assignee, OR
 *  - the user created the lead, OR
 *  - the user is currently mentioned in a (non-deleted) remark on the lead,
 *    either a ticket reply or an internal chat message.
 * Mention access disappears as soon as the mention or the remark is removed.
 *
 * `alias` is the SQL alias of the tickets table, `userParam` the placeholder
 * holding the user id (':name' for query builders, '$n' for raw queries).
 */
export function leadVisibilityPredicate(alias: string, userParam: string) {
  return `(
    ${alias}."assigneeId" = ${userParam}::uuid
    OR ${alias}."createdBy" = ${userParam}::uuid
    OR EXISTS (
      SELECT 1 FROM ticket_replies lv_tr
      WHERE lv_tr."ticketId" = ${alias}."id"
        AND lv_tr."deletedAt" IS NULL
        AND ${userParam}::uuid = ANY(lv_tr."mentionedUserIds")
    )
    OR EXISTS (
      SELECT 1 FROM chat_messages_internal lv_cm
      WHERE lv_cm."ticket_id" = ${alias}."id"
        AND lv_cm."is_deleted" = false
        AND ${userParam}::uuid = ANY(lv_cm."mentionedUserIds")
    )
  )`;
}

/** Restricts a ticket query builder to the leads the user is allowed to see. */
export function applyLeadScope<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  user: LeadScopeUser,
  alias = 't',
): SelectQueryBuilder<T> {
  const access = getLeadAccess(user);

  if (access === LeadAccess.NONE) {
    qb.andWhere('1 = 0');
  } else if (access === LeadAccess.ASSIGNED) {
    qb.andWhere(leadVisibilityPredicate(alias, ':leadScopeUserId'), {
      leadScopeUserId: user?.id,
    });
  }

  return qb;
}

/**
 * SQL fragment + params for the same rule, for use inside a JOIN condition
 * (e.g. counting a project's leads without hiding the project itself).
 */
export function leadScopeCondition(
  user: LeadScopeUser,
  alias = 't',
): { sql: string; params: Record<string, string | undefined> } {
  const access = getLeadAccess(user);

  if (access === LeadAccess.NONE) return { sql: '1 = 0', params: {} };
  if (access === LeadAccess.ASSIGNED) {
    return {
      sql: leadVisibilityPredicate(alias, ':leadScopeUserId'),
      params: { leadScopeUserId: user?.id },
    };
  }
  return { sql: '1 = 1', params: {} };
}

/** True when the user may see the given lead. */
export async function canViewLead(
  db: QueryRunner,
  user: LeadScopeUser,
  ticketId: string,
): Promise<boolean> {
  const access = getLeadAccess(user);
  if (access === LeadAccess.ALL) return true;
  if (access === LeadAccess.NONE || !user?.id || !ticketId) return false;

  const rows = await db.query(
    `SELECT 1 FROM tickets t WHERE t.id = $1 AND ${leadVisibilityPredicate('t', '$2')} LIMIT 1`,
    [ticketId, user.id],
  );
  return rows.length > 0;
}

export async function assertCanViewLead(
  db: QueryRunner,
  user: LeadScopeUser,
  ticketId: string,
): Promise<void> {
  if (!(await canViewLead(db, user, ticketId))) {
    throw new ForbiddenException('You do not have access to this lead');
  }
}

/**
 * Writing on a lead (replies, remarks, internal and client chat) needs more
 * than being able to see it: the user must be a participant (assignee,
 * creator, or mentioned) unless their role holds ticket_replies.post_any_lead.
 * External (client) users are not restricted here.
 */
export async function canPostOnLead(
  db: QueryRunner,
  user: LeadScopeUser,
  ticketId: string,
): Promise<boolean> {
  if (!user?.id || !ticketId) return false;
  if (user.userType === 'EXTERNAL') return true;
  if (!(await canViewLead(db, user, ticketId))) return false;
  if (hasClaim(user, LEAD_CLAIMS.postAnyLead)) return true;

  const rows = await db.query(
    `SELECT 1 FROM tickets t WHERE t.id = $1 AND ${leadVisibilityPredicate('t', '$2')} LIMIT 1`,
    [ticketId, user.id],
  );
  return rows.length > 0;
}

export async function assertCanPostOnLead(
  db: QueryRunner,
  user: LeadScopeUser,
  ticketId: string,
): Promise<void> {
  if (!(await canPostOnLead(db, user, ticketId))) {
    throw new ForbiddenException(
      'You can only reply on leads assigned to you, created by you, or where you are mentioned.',
    );
  }
}

/**
 * Server-side check of the role's action claims (the UI hides these buttons,
 * the API must refuse them too). External users are not claim-gated.
 */
export function assertHasClaim(
  user: LeadScopeUser,
  claim: string,
  message = 'You do not have permission to perform this action',
): void {
  if (user?.userType === 'EXTERNAL') return;
  if (!hasClaim(user, claim)) throw new ForbiddenException(message);
}
