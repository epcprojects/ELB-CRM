export type AnalyticsFilters = {
  dateFrom?: string;
  dateTo?: string;
  projectIds?: string[];
  agentId?: string;
  granularity?: 'day' | 'week' | 'month';
};

export type AgentRosterAgent = {
  id: string;
  fullName: string;
  email: string;
  isInvitationAccepted: boolean;
  lastLoginAt: string | null;
  openLeadCount: number;
  totalAssignedCount: number;
  isActive: boolean;
  projects: { id: string; name: string }[];
};

export type AgentRoster = {
  totalAgents: number;
  active: number;
  inactive: number;
  pendingInvite: number;
  agents: AgentRosterAgent[];
};

export type AgentWorkload = {
  agentId: string;
  fullName: string;
  byStatus: Record<string, number>;
  openCount: number;
  totalCount: number;
};

export type AgentPerformance = {
  agentId: string;
  fullName: string;
  totalAssigned: number;
  closedCount: number;
  closeRate: number;
  avgFirstResponseMinutes: number | null;
  medianFirstResponseMinutes: number | null;
};

export type ResponseTimeBucket = { label: string; count: number };

export type ResponseTimeSummary = {
  avgMinutes: number;
  medianMinutes: number;
  p90Minutes: number;
  sampleSize: number;
  buckets: ResponseTimeBucket[];
  byAgent?: { agentId: string; avgMinutes: number; medianMinutes: number; p90Minutes: number; count: number }[];
  byProject: { projectId: string; avgMinutes: number; medianMinutes: number; p90Minutes: number; count: number }[];
};

export type StatusTrends = {
  granularity: string;
  statuses: { key: string; label: string; color: string }[];
  createdVolume: { bucket: string; statusKey: string; count: number }[];
  transitions: { bucket: string; statusKey: string; count: number }[];
};

export type SlaAging = {
  totalOpen: number;
  overdueCount: number;
  buckets: { label: string; count: number }[];
};

export type ActivityHeatmapCell = { dayOfWeek: number; hour: number; count: number };

export type ProjectComparisonRow = {
  projectId: string;
  projectName: string;
  totalLeads: number;
  closedCount: number;
  closeRate: number;
  avgFirstResponseMinutes: number | null;
};

export type ProjectOverviewRow = {
  projectId: string;
  projectName: string;
  totalLeads: number;
  openCount: number;
  closedCount: number;
  agentCount: number;
  statusBreakdown: { key: string; label: string; color: string; count: number }[];
};

function buildSearchParams(filters: AnalyticsFilters): string {
  const params = new URLSearchParams();
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  if (filters.agentId) params.set('agentId', filters.agentId);
  if (filters.granularity) params.set('granularity', filters.granularity);
  for (const projectId of filters.projectIds ?? []) {
    params.append('projectIds', projectId);
  }
  return params.toString();
}

async function getJson<T>(path: string, filters: AnalyticsFilters): Promise<T> {
  const query = buildSearchParams(filters);
  const response = await fetch(
    `${path}${query ? `?${query}` : ''}`,
    {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    },
  );

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.message || 'Failed to fetch analytics data.');
  }

  return payload as T;
}

export const fetchAgentRoster = (filters: AnalyticsFilters) =>
  getJson<AgentRoster>('/api/dashboard/analytics/agents/roster', filters);

export const fetchAgentWorkload = (filters: AnalyticsFilters) =>
  getJson<AgentWorkload[]>('/api/dashboard/analytics/agents/workload', filters);

export const fetchAgentPerformance = (filters: AnalyticsFilters) =>
  getJson<AgentPerformance[]>('/api/dashboard/analytics/agents/performance', filters);

export const fetchResponseTime = (filters: AnalyticsFilters) =>
  getJson<ResponseTimeSummary>('/api/dashboard/analytics/response-time', filters);

export const fetchStatusTrends = (filters: AnalyticsFilters) =>
  getJson<StatusTrends>('/api/dashboard/analytics/status-trends', filters);

export const fetchSlaAging = (filters: AnalyticsFilters) =>
  getJson<SlaAging>('/api/dashboard/analytics/sla-aging', filters);

export const fetchActivityHeatmap = (filters: AnalyticsFilters) =>
  getJson<ActivityHeatmapCell[]>('/api/dashboard/analytics/activity-heatmap', filters);

export const fetchProjectComparison = (filters: AnalyticsFilters) =>
  getJson<ProjectComparisonRow[]>('/api/dashboard/analytics/project-comparison', filters);

export const fetchProjectOverview = (filters: AnalyticsFilters) =>
  getJson<ProjectOverviewRow[]>('/api/dashboard/analytics/projects/overview', filters);
