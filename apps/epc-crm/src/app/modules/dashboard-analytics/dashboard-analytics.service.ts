import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Ticket } from '../tickets/entities/ticket.entity';
import { TicketStatus } from '../tickets/entities/ticket.statuses.entity';
import { User } from '../users/entities/user.entity';
import { Project } from '../projects/entities/project.entity';
import {
  applyLeadScope,
  assertHasClaim,
  getLeadAccess,
  hasClaim,
  LeadAccess,
  leadVisibilityPredicate,
} from '../tickets/ticket-visibility.util';
import { DASHBOARD_ANALYTICS_CLAIMS } from './dashboard-analytics.claims';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';

type FirstReplyRow = {
  ticketId: string;
  assigneeId: string | null;
  projectId: string;
  minutesToFirstReply: string;
};

const RESPONSE_TIME_BUCKETS = [
  { label: '<15m', maxMinutes: 15 },
  { label: '15-60m', maxMinutes: 60 },
  { label: '1-4h', maxMinutes: 240 },
  { label: '4-24h', maxMinutes: 1440 },
  { label: '>24h', maxMinutes: Infinity },
];

@Injectable()
export class DashboardAnalyticsService {
  constructor(
    @InjectRepository(Ticket)
    private readonly ticketRepo: Repository<Ticket>,
    @InjectRepository(TicketStatus)
    private readonly statusRepo: Repository<TicketStatus>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  // Every ticket aggregation starts from here: restricts to projects the
  // caller is a member of, then to the leads their claims let them see.
  private baseTicketQb(user: any, projectIds?: string[]) {
    const qb = this.ticketRepo
      .createQueryBuilder('t')
      .leftJoin('t.project', 'p')
      .innerJoin('p.members', 'u', 'u.id = :userId', { userId: user.id });

    if (projectIds?.length) {
      qb.andWhere('t.projectId IN (:...projectIds)', { projectIds });
    }

    applyLeadScope(qb, user);
    return qb;
  }

  private summarizeMinutes(values: number[]) {
    if (values.length === 0) {
      return { avgMinutes: 0, medianMinutes: 0, p90Minutes: 0, count: 0 };
    }
    const sorted = [...values].sort((a, b) => a - b);
    const avg = sorted.reduce((sum, v) => sum + v, 0) / sorted.length;
    const median = sorted[Math.floor(sorted.length / 2)];
    const p90 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))];
    return {
      avgMinutes: Math.round(avg),
      medianMinutes: Math.round(median),
      p90Minutes: Math.round(p90),
      count: sorted.length,
    };
  }

  // Platform super-admin accounts exist for system administration, not for
  // working leads, so they're excluded from every agent-grouped metric.
  private excludeSuperAdminSql(userIdColumn: string) {
    return `NOT EXISTS (
      SELECT 1 FROM user_roles ur
      INNER JOIN roles r ON r.id = ur."roleId"
      WHERE ur."userId" = ${userIdColumn} AND r."normalizedName" = 'SUPER_ADMIN'
    )`;
  }

  private bucketMinutes(values: number[]) {
    return RESPONSE_TIME_BUCKETS.map((bucket) => ({
      label: bucket.label,
      count: values.filter((v) => v <= bucket.maxMinutes).length,
    })).map((bucket, index, all) => ({
      // each bucket is exclusive of the ones before it
      label: bucket.label,
      count: index === 0 ? bucket.count : bucket.count - all[index - 1].count,
    }));
  }

  // Raw SQL: TypeORM's query builder can't express the LATERAL join needed
  // to get each lead's first agent reply efficiently. Scoped by the same two
  // rules as baseTicketQb (project membership, then lead-claim access), just
  // written as parametrized raw SQL instead of query-builder calls.
  private async firstReplyRows(
    user: any,
    query: Pick<AnalyticsQueryDto, 'projectIds' | 'agentId' | 'dateFrom' | 'dateTo'>,
  ): Promise<FirstReplyRow[]> {
    const params: unknown[] = [user.id];
    const conditions: string[] = [
      `t."deletedAt" IS NULL`,
      `EXISTS (SELECT 1 FROM user_projects_join upj WHERE upj."usersId" = $1 AND upj."projectsId" = t."projectId")`,
    ];

    const access = getLeadAccess(user);
    if (access === LeadAccess.NONE) {
      conditions.push('1 = 0');
    } else if (access === LeadAccess.ASSIGNED) {
      params.push(user.id);
      conditions.push(leadVisibilityPredicate('t', `$${params.length}`));
    }

    if (query.projectIds?.length) {
      params.push(query.projectIds);
      conditions.push(`t."projectId" = ANY($${params.length}::uuid[])`);
    }
    if (query.agentId) {
      params.push(query.agentId);
      conditions.push(`t."assigneeId" = $${params.length}`);
    }
    if (query.dateFrom) {
      params.push(query.dateFrom);
      conditions.push(`t."createdAt" >= $${params.length}`);
    }
    if (query.dateTo) {
      params.push(query.dateTo);
      conditions.push(`t."createdAt" <= $${params.length}`);
    }

    const sql = `
      SELECT t.id AS "ticketId", t."assigneeId", t."projectId",
             EXTRACT(EPOCH FROM (fr."createdAt" - t."createdAt")) / 60 AS "minutesToFirstReply"
      FROM tickets t
      JOIN LATERAL (
        SELECT tr."createdAt" FROM ticket_replies tr
        INNER JOIN users au ON au.id = tr."authorId"
        WHERE tr."ticketId" = t.id
          AND tr."isInternal" = false
          AND tr."deletedAt" IS NULL
          AND au."userType" = 'INTERNAL'
        ORDER BY tr."createdAt" ASC
        LIMIT 1
      ) fr ON true
      WHERE ${conditions.join(' AND ')}
    `;

    return this.dataSource.query(sql, params);
  }

  // ---------------- AGENT ROSTER ----------------
  async getAgentRoster(query: AnalyticsQueryDto, user: any) {
    assertHasClaim(user, DASHBOARD_ANALYTICS_CLAIMS.view);
    const canViewTeam = hasClaim(user, DASHBOARD_ANALYTICS_CLAIMS.viewTeam);

    const effectiveAgentId = canViewTeam ? query.agentId : user.id;

    const agentQb = this.userRepo
      .createQueryBuilder('agent')
      .innerJoin('agent.projects', 'p')
      .innerJoin('p.members', 'caller', 'caller.id = :callerId', { callerId: user.id })
      .where('agent.userType = :type', { type: 'INTERNAL' })
      .andWhere('agent.isDeleted = false')
      .andWhere(this.excludeSuperAdminSql('agent.id'))
      .select([
        'agent.id',
        'agent.fullName',
        'agent.email',
        'agent.isInvitationAccepted',
        'agent.lastLoginAt',
      ]);

    if (query.projectIds?.length) {
      agentQb.andWhere('p.id IN (:...projectIds)', { projectIds: query.projectIds });
    }
    if (effectiveAgentId) {
      agentQb.andWhere('agent.id = :filterAgentId', { filterAgentId: effectiveAgentId });
    }

    const agents = await agentQb.getMany();

    const ticketQb = this.baseTicketQb(user, query.projectIds)
      .leftJoin('t.status', 's')
      .select('t.assigneeId', 'assigneeId')
      .addSelect('COUNT(t.id)', 'total')
      .addSelect(`COUNT(t.id) FILTER (WHERE s."isClosed" = false)`, 'open')
      .andWhere('t.assigneeId IS NOT NULL')
      .groupBy('t.assigneeId');
    if (effectiveAgentId) {
      ticketQb.andWhere('t.assigneeId = :agentId', { agentId: effectiveAgentId });
    }
    const counts = await ticketQb.getRawMany();
    const countMap = new Map(
      counts.map((c) => [c.assigneeId, { total: Number(c.total), open: Number(c.open) }]),
    );

    // Projects each agent belongs to, restricted to projects the caller can
    // also see (same intersection the agent list itself is scoped to).
    const agentIds = agents.map((a) => a.id);
    const projectsByAgent = new Map<string, { id: string; name: string }[]>();
    if (agentIds.length) {
      const projectRows = await this.userRepo
        .createQueryBuilder('u')
        .innerJoin('u.projects', 'proj')
        .innerJoin('proj.members', 'caller', 'caller.id = :callerId', { callerId: user.id })
        .where('u.id IN (:...agentIds)', { agentIds })
        .select('u.id', 'agentId')
        .addSelect('proj.id', 'projectId')
        .addSelect('proj.name', 'projectName')
        .orderBy('proj.name', 'ASC')
        .getRawMany();

      for (const row of projectRows) {
        const list = projectsByAgent.get(row.agentId) ?? [];
        list.push({ id: row.projectId, name: row.projectName });
        projectsByAgent.set(row.agentId, list);
      }
    }

    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    const now = Date.now();

    const result = agents.map((a) => {
      const counted = countMap.get(a.id) ?? { total: 0, open: 0 };
      const recentlyActive = a.lastLoginAt
        ? now - new Date(a.lastLoginAt).getTime() < THIRTY_DAYS_MS
        : false;
      return {
        id: a.id,
        fullName: a.fullName,
        email: a.email,
        isInvitationAccepted: a.isInvitationAccepted,
        lastLoginAt: a.lastLoginAt,
        openLeadCount: counted.open,
        totalAssignedCount: counted.total,
        isActive: a.isInvitationAccepted && (recentlyActive || counted.open > 0),
        projects: projectsByAgent.get(a.id) ?? [],
      };
    });

    const pendingInvite = result.filter((a) => !a.isInvitationAccepted).length;
    const active = result.filter((a) => a.isActive).length;
    const inactive = result.length - active - pendingInvite;

    return { totalAgents: result.length, active, inactive, pendingInvite, agents: result };
  }

  // ---------------- AGENT WORKLOAD (what each agent is doing now) ----------------
  async getAgentWorkload(query: AnalyticsQueryDto, user: any) {
    assertHasClaim(user, DASHBOARD_ANALYTICS_CLAIMS.view);
    const canViewTeam = hasClaim(user, DASHBOARD_ANALYTICS_CLAIMS.viewTeam);

    const qb = this.baseTicketQb(user, query.projectIds)
      .innerJoin('t.assignee', 'a')
      .andWhere(this.excludeSuperAdminSql('t."assigneeId"'))
      .select('t.assigneeId', 'assigneeId')
      .addSelect('a.fullName', 'fullName')
      .addSelect('t.statusKey', 'statusKey')
      .addSelect('COUNT(t.id)', 'count')
      .groupBy('t.assigneeId')
      .addGroupBy('a.fullName')
      .addGroupBy('t.statusKey');
    if (!canViewTeam) {
      qb.andWhere('t.assigneeId = :agentId', { agentId: user.id });
    } else if (query.agentId) {
      qb.andWhere('t.assigneeId = :agentId', { agentId: query.agentId });
    }

    const [rows, statuses] = await Promise.all([qb.getRawMany(), this.statusRepo.find()]);
    const closedKeys = new Set(statuses.filter((s) => s.isClosed).map((s) => s.key));

    const byAgent = new Map<
      string,
      { agentId: string; fullName: string; byStatus: Record<string, number>; openCount: number; totalCount: number }
    >();
    for (const row of rows) {
      const key = row.assigneeId;
      const entry =
        byAgent.get(key) ?? { agentId: key, fullName: row.fullName, byStatus: {}, openCount: 0, totalCount: 0 };
      const count = Number(row.count);
      entry.byStatus[row.statusKey] = count;
      entry.totalCount += count;
      if (!closedKeys.has(row.statusKey)) entry.openCount += count;
      byAgent.set(key, entry);
    }

    return Array.from(byAgent.values());
  }

  // ---------------- AGENT PERFORMANCE (leaderboard) ----------------
  async getAgentPerformance(query: AnalyticsQueryDto, user: any) {
    assertHasClaim(user, DASHBOARD_ANALYTICS_CLAIMS.view);
    const canViewTeam = hasClaim(user, DASHBOARD_ANALYTICS_CLAIMS.viewTeam);

    const qb = this.baseTicketQb(user, query.projectIds)
      .innerJoin('t.assignee', 'a')
      .leftJoin('t.status', 's')
      .andWhere(this.excludeSuperAdminSql('t."assigneeId"'))
      .select('t.assigneeId', 'assigneeId')
      .addSelect('a.fullName', 'fullName')
      .addSelect('COUNT(t.id)', 'totalAssigned')
      .addSelect(`COUNT(t.id) FILTER (WHERE s."isClosed" = true)`, 'closedCount')
      .groupBy('t.assigneeId')
      .addGroupBy('a.fullName');
    if (query.dateFrom) qb.andWhere('t.createdAt >= :dateFrom', { dateFrom: query.dateFrom });
    if (query.dateTo) qb.andWhere('t.createdAt <= :dateTo', { dateTo: query.dateTo });
    const effectiveAgentId = canViewTeam ? query.agentId : user.id;
    if (effectiveAgentId) {
      qb.andWhere('t.assigneeId = :agentId', { agentId: effectiveAgentId });
    }

    const [rows, replyRows] = await Promise.all([
      qb.getRawMany(),
      this.firstReplyRows(user, {
        projectIds: query.projectIds,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        agentId: effectiveAgentId,
      }),
    ]);

    const byAgentMinutes = new Map<string, number[]>();
    for (const r of replyRows) {
      if (!r.assigneeId) continue;
      const list = byAgentMinutes.get(r.assigneeId) ?? [];
      list.push(Number(r.minutesToFirstReply));
      byAgentMinutes.set(r.assigneeId, list);
    }

    return rows
      .map((r) => {
        const total = Number(r.totalAssigned);
        const closed = Number(r.closedCount);
        const stats = this.summarizeMinutes(byAgentMinutes.get(r.assigneeId) ?? []);
        return {
          agentId: r.assigneeId,
          fullName: r.fullName,
          totalAssigned: total,
          closedCount: closed,
          closeRate: total ? Math.round((closed / total) * 1000) / 10 : 0,
          avgFirstResponseMinutes: stats.count ? stats.avgMinutes : null,
          medianFirstResponseMinutes: stats.count ? stats.medianMinutes : null,
        };
      })
      .sort((a, b) => b.closeRate - a.closeRate);
  }

  // ---------------- RESPONSE TIME ----------------
  async getResponseTime(query: AnalyticsQueryDto, user: any) {
    assertHasClaim(user, DASHBOARD_ANALYTICS_CLAIMS.view);
    const canViewTeam = hasClaim(user, DASHBOARD_ANALYTICS_CLAIMS.viewTeam);
    const effectiveAgentId = canViewTeam ? query.agentId : user.id;

    const rows = await this.firstReplyRows(user, { ...query, agentId: effectiveAgentId });
    const minutes = rows
      .map((r) => Number(r.minutesToFirstReply))
      .filter((v) => Number.isFinite(v) && v >= 0);

    const overall = this.summarizeMinutes(minutes);
    const buckets = this.bucketMinutes(minutes);

    const byAgentMinutes = new Map<string, number[]>();
    const byProjectMinutes = new Map<string, number[]>();
    for (const r of rows) {
      const minutesValue = Number(r.minutesToFirstReply);
      if (!Number.isFinite(minutesValue) || minutesValue < 0) continue;
      if (r.assigneeId) {
        const list = byAgentMinutes.get(r.assigneeId) ?? [];
        list.push(minutesValue);
        byAgentMinutes.set(r.assigneeId, list);
      }
      const projectList = byProjectMinutes.get(r.projectId) ?? [];
      projectList.push(minutesValue);
      byProjectMinutes.set(r.projectId, projectList);
    }

    return {
      avgMinutes: overall.avgMinutes,
      medianMinutes: overall.medianMinutes,
      p90Minutes: overall.p90Minutes,
      sampleSize: overall.count,
      buckets,
      byAgent: canViewTeam
        ? Array.from(byAgentMinutes.entries()).map(([agentId, values]) => ({
            agentId,
            ...this.summarizeMinutes(values),
          }))
        : undefined,
      byProject: Array.from(byProjectMinutes.entries()).map(([projectId, values]) => ({
        projectId,
        ...this.summarizeMinutes(values),
      })),
    };
  }

  // ---------------- STATUS TRENDS ----------------
  async getStatusTrends(query: AnalyticsQueryDto, user: any) {
    assertHasClaim(user, DASHBOARD_ANALYTICS_CLAIMS.view);
    const granularity = query.granularity ?? 'week';

    const qb = this.baseTicketQb(user, query.projectIds)
      .select(`date_trunc('${granularity}', t."createdAt")`, 'bucket')
      .addSelect('t.statusKey', 'statusKey')
      .addSelect('COUNT(t.id)', 'count')
      .groupBy('bucket')
      .addGroupBy('t.statusKey')
      .orderBy('bucket', 'ASC');
    if (query.dateFrom) qb.andWhere('t.createdAt >= :dateFrom', { dateFrom: query.dateFrom });
    if (query.dateTo) qb.andWhere('t.createdAt <= :dateTo', { dateTo: query.dateTo });

    const params: unknown[] = [user.id];
    const transConditions: string[] = [
      `al.type = 'ticket_status_changed'`,
      `al.metadata->>'toStatusKey' IS NOT NULL`,
      `al."deletedAt" IS NULL`,
      `EXISTS (SELECT 1 FROM user_projects_join upj WHERE upj."usersId" = $1 AND upj."projectsId" = al."projectId")`,
    ];
    if (query.projectIds?.length) {
      params.push(query.projectIds);
      transConditions.push(`al."projectId" = ANY($${params.length}::uuid[])`);
    }
    if (query.dateFrom) {
      params.push(query.dateFrom);
      transConditions.push(`al."createdAt" >= $${params.length}`);
    }
    if (query.dateTo) {
      params.push(query.dateTo);
      transConditions.push(`al."createdAt" <= $${params.length}`);
    }
    const transSql = `
      SELECT date_trunc('${granularity}', al."createdAt") AS bucket,
             al.metadata->>'toStatusKey' AS "toStatusKey",
             COUNT(*) AS count
      FROM activity_logs al
      WHERE ${transConditions.join(' AND ')}
      GROUP BY bucket, "toStatusKey"
      ORDER BY bucket ASC
    `;

    const [createdRows, statuses, transRows] = await Promise.all([
      qb.getRawMany(),
      this.statusRepo.find({ order: { sortOrder: 'ASC' } }),
      this.dataSource.query(transSql, params),
    ]);

    return {
      granularity,
      statuses: statuses.map((s) => ({ key: s.key, label: s.label, color: s.color })),
      createdVolume: createdRows.map((r) => ({
        bucket: r.bucket,
        statusKey: r.statusKey,
        count: Number(r.count),
      })),
      transitions: transRows.map((r: { bucket: string; toStatusKey: string; count: string }) => ({
        bucket: r.bucket,
        statusKey: r.toStatusKey,
        count: Number(r.count),
      })),
    };
  }

  // ---------------- SLA / LEAD AGING ----------------
  async getSlaAging(query: AnalyticsQueryDto, user: any) {
    assertHasClaim(user, DASHBOARD_ANALYTICS_CLAIMS.view);
    const canViewTeam = hasClaim(user, DASHBOARD_ANALYTICS_CLAIMS.viewTeam);
    const effectiveAgentId = canViewTeam ? query.agentId : user.id;

    const qb = this.baseTicketQb(user, query.projectIds)
      .innerJoin('t.status', 's')
      .andWhere('s.isClosed = false')
      .select('t.id', 'id')
      .addSelect('t.createdAt', 'createdAt')
      .addSelect('t.dueDate', 'dueDate');
    if (effectiveAgentId) {
      qb.andWhere('t.assigneeId = :agentId', { agentId: effectiveAgentId });
    }

    const rows = await qb.getRawMany();
    const now = Date.now();
    const ageBuckets = [
      { label: '<24h', maxMs: 24 * 60 * 60 * 1000 },
      { label: '1-3d', maxMs: 3 * 24 * 60 * 60 * 1000 },
      { label: '3-7d', maxMs: 7 * 24 * 60 * 60 * 1000 },
      { label: '>7d', maxMs: Infinity },
    ];

    const counts = ageBuckets.map(() => 0);
    let overdueCount = 0;
    for (const row of rows) {
      const age = now - new Date(row.createdAt).getTime();
      const bucketIndex = ageBuckets.findIndex((b) => age <= b.maxMs);
      counts[bucketIndex === -1 ? counts.length - 1 : bucketIndex] += 1;
      if (row.dueDate && new Date(row.dueDate).getTime() < now) overdueCount += 1;
    }

    return {
      totalOpen: rows.length,
      overdueCount,
      buckets: ageBuckets.map((b, i) => ({ label: b.label, count: counts[i] })),
    };
  }

  // ---------------- BUSIEST REPLY TIMES ----------------
  async getActivityHeatmap(query: AnalyticsQueryDto, user: any) {
    assertHasClaim(user, DASHBOARD_ANALYTICS_CLAIMS.view);
    const canViewTeam = hasClaim(user, DASHBOARD_ANALYTICS_CLAIMS.viewTeam);

    const params: unknown[] = [user.id];
    const conditions: string[] = [
      `tr."isInternal" = false`,
      `tr."deletedAt" IS NULL`,
      `au."userType" = 'INTERNAL'`,
      `EXISTS (SELECT 1 FROM user_projects_join upj WHERE upj."usersId" = $1 AND upj."projectsId" = t."projectId")`,
    ];

    const access = getLeadAccess(user);
    if (access === LeadAccess.NONE) {
      conditions.push('1 = 0');
    } else if (access === LeadAccess.ASSIGNED) {
      params.push(user.id);
      conditions.push(leadVisibilityPredicate('t', `$${params.length}`));
    }

    if (!canViewTeam) {
      params.push(user.id);
      conditions.push(`tr."authorId" = $${params.length}`);
    } else if (query.agentId) {
      params.push(query.agentId);
      conditions.push(`tr."authorId" = $${params.length}`);
    }
    if (query.projectIds?.length) {
      params.push(query.projectIds);
      conditions.push(`t."projectId" = ANY($${params.length}::uuid[])`);
    }

    const sql = `
      SELECT EXTRACT(DOW FROM tr."createdAt") AS "dayOfWeek",
             EXTRACT(HOUR FROM tr."createdAt") AS hour,
             COUNT(*) AS count
      FROM ticket_replies tr
      INNER JOIN tickets t ON t.id = tr."ticketId"
      INNER JOIN users au ON au.id = tr."authorId"
      WHERE ${conditions.join(' AND ')}
      GROUP BY "dayOfWeek", hour
    `;
    const rows = await this.dataSource.query(sql, params);
    return rows.map((r: { dayOfWeek: string; hour: string; count: string }) => ({
      dayOfWeek: Number(r.dayOfWeek),
      hour: Number(r.hour),
      count: Number(r.count),
    }));
  }

  // ---------------- PROJECT COMPARISON ----------------
  async getProjectComparison(query: AnalyticsQueryDto, user: any) {
    assertHasClaim(user, DASHBOARD_ANALYTICS_CLAIMS.view);

    const qb = this.baseTicketQb(user, query.projectIds)
      .leftJoin('t.status', 's')
      .select('t.projectId', 'projectId')
      .addSelect('p.name', 'projectName')
      .addSelect('COUNT(t.id)', 'totalLeads')
      .addSelect(`COUNT(t.id) FILTER (WHERE s."isClosed" = true)`, 'closedCount')
      .groupBy('t.projectId')
      .addGroupBy('p.name');
    if (query.dateFrom) qb.andWhere('t.createdAt >= :dateFrom', { dateFrom: query.dateFrom });
    if (query.dateTo) qb.andWhere('t.createdAt <= :dateTo', { dateTo: query.dateTo });

    const [rows, replyRows] = await Promise.all([
      qb.getRawMany(),
      this.firstReplyRows(user, {
        projectIds: query.projectIds,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
      }),
    ]);

    const byProjectMinutes = new Map<string, number[]>();
    for (const r of replyRows) {
      const list = byProjectMinutes.get(r.projectId) ?? [];
      list.push(Number(r.minutesToFirstReply));
      byProjectMinutes.set(r.projectId, list);
    }

    return rows.map((r) => {
      const total = Number(r.totalLeads);
      const closed = Number(r.closedCount);
      const stats = this.summarizeMinutes(byProjectMinutes.get(r.projectId) ?? []);
      return {
        projectId: r.projectId,
        projectName: r.projectName,
        totalLeads: total,
        closedCount: closed,
        closeRate: total ? Math.round((closed / total) * 1000) / 10 : 0,
        avgFirstResponseMinutes: stats.count ? stats.avgMinutes : null,
      };
    });
  }

  // ---------------- PROJECT OVERVIEW (what's going on in each project) ----------------
  async getProjectOverview(query: AnalyticsQueryDto, user: any) {
    assertHasClaim(user, DASHBOARD_ANALYTICS_CLAIMS.view);

    // Projects the caller can see, independent of whether they currently
    // hold any leads - a brand-new project should still show up, at zero.
    const projectQb = this.dataSource
      .getRepository(Project)
      .createQueryBuilder('p')
      .innerJoin('p.members', 'caller', 'caller.id = :callerId', { callerId: user.id })
      .select(['p.id', 'p.name']);
    if (query.projectIds?.length) {
      projectQb.andWhere('p.id IN (:...projectIds)', { projectIds: query.projectIds });
    }
    const projects = await projectQb.getMany();
    const projectIds = projects.map((p) => p.id);
    if (projectIds.length === 0) {
      return [];
    }

    const [statusRows, statuses, agentCountRows] = await Promise.all([
      this.baseTicketQb(user, projectIds)
        .select('t.projectId', 'projectId')
        .addSelect('t.statusKey', 'statusKey')
        .addSelect('COUNT(t.id)', 'count')
        .groupBy('t.projectId')
        .addGroupBy('t.statusKey')
        .getRawMany(),
      this.statusRepo.find({ order: { sortOrder: 'ASC' } }),
      this.userRepo
        .createQueryBuilder('u')
        .innerJoin('u.projects', 'proj')
        .where('proj.id IN (:...projectIds)', { projectIds })
        .andWhere('u.userType = :type', { type: 'INTERNAL' })
        .andWhere('u.isDeleted = false')
        .andWhere(this.excludeSuperAdminSql('u.id'))
        .select('proj.id', 'projectId')
        .addSelect('COUNT(DISTINCT u.id)', 'agentCount')
        .groupBy('proj.id')
        .getRawMany(),
    ]);

    const closedKeys = new Set(statuses.filter((s) => s.isClosed).map((s) => s.key));
    const statusByProject = new Map<string, Map<string, number>>();
    for (const row of statusRows) {
      const counts = statusByProject.get(row.projectId) ?? new Map<string, number>();
      counts.set(row.statusKey, Number(row.count));
      statusByProject.set(row.projectId, counts);
    }
    const agentCountByProject = new Map(
      agentCountRows.map((row) => [row.projectId, Number(row.agentCount)]),
    );

    return projects.map((p) => {
      const counts = statusByProject.get(p.id) ?? new Map<string, number>();
      const statusBreakdown = statuses.map((s) => ({
        key: s.key,
        label: s.label,
        color: s.color,
        count: counts.get(s.key) ?? 0,
      }));
      const totalLeads = statusBreakdown.reduce((sum, s) => sum + s.count, 0);
      const closedCount = statusBreakdown
        .filter((s) => closedKeys.has(s.key))
        .reduce((sum, s) => sum + s.count, 0);

      return {
        projectId: p.id,
        projectName: p.name,
        totalLeads,
        openCount: totalLeads - closedCount,
        closedCount,
        agentCount: agentCountByProject.get(p.id) ?? 0,
        statusBreakdown,
      };
    });
  }
}
