'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePermissions } from '../../../app/providers/PermissionProvider';
import { useProjectNamesQuery } from '../../../app/(main-pages)/projects/projects.queries';
import type { AnalyticsFilters } from '../../../app/(main-pages)/dashboard/dashboard-analytics.data';
import {
  useAgentPerformanceQuery,
  useAgentRosterQuery,
  useAgentWorkloadQuery,
  useProjectComparisonQuery,
  useSlaAgingQuery,
  useStatusTrendsQuery,
} from '../../../app/(main-pages)/dashboard/dashboard-analytics.queries';
import AnalyticsFilterBar from './AnalyticsFilterBar';
import AgentRosterCard from './AgentRosterCard';
import AgentWorkloadChart from './AgentWorkloadChart';
import AgentPerformanceLeaderboard from './AgentPerformanceLeaderboard';
import StatusTrendChart from './StatusTrendChart';
import SlaAgingChart from './SlaAgingChart';
import ProjectComparisonChart from './ProjectComparisonChart';

export default function AnalyticsSection() {
  const router = useRouter();
  const { hasPermission } = usePermissions();
  const canViewTeam = hasPermission('dashboard.view_team_analytics');

  const [filters, setFilters] = useState<AnalyticsFilters>({
    granularity: 'week',
  });

  const projectNamesQuery = useProjectNamesQuery();

  // Scoped only by project, never by the agent filter itself - otherwise
  // picking an agent would shrink the dropdown's own option list down to
  // just that one agent.
  const agentOptionsQuery = useAgentRosterQuery({
    projectIds: filters.projectIds,
  });

  const rosterQuery = useAgentRosterQuery(filters);
  const workloadQuery = useAgentWorkloadQuery(filters);
  const performanceQuery = useAgentPerformanceQuery(filters);
  const statusTrendsQuery = useStatusTrendsQuery(filters);
  const slaAgingQuery = useSlaAgingQuery(filters);
  const projectComparisonQuery = useProjectComparisonQuery(filters);

  const goToLeads = (params: Record<string, string>) => {
    const search = new URLSearchParams(params).toString();
    router.push(`/tickets${search ? `?${search}` : ''}`);
  };

  return (
    <div className="flex min-w-0 w-full max-w-full flex-col xl:gap-3 overflow-x-hidden  md:px-0">
      <AnalyticsFilterBar
        filters={filters}
        onChange={setFilters}
        
        projectOptions={projectNamesQuery.data ?? []}
        agentOptions={(agentOptionsQuery.data?.agents ?? []).map((agent) => ({
          id: agent.id,
          fullName: agent.fullName,
        }))}
        canFilterByAgent={canViewTeam}
      />
      <div className="grid min-w-0 w-full grid-cols-1 xl:gap-3 xl:grid-cols-2 [&>*]:min-w-0">
        <AgentRosterCard
          data={rosterQuery.data}
          isLoading={rosterQuery.isLoading}
          canViewTeam={canViewTeam}
          onAgentClick={(agentId) => goToLeads({ assigneeId: agentId })}
        />
        <AgentPerformanceLeaderboard
          data={performanceQuery.data}
          isLoading={performanceQuery.isLoading}
          onAgentClick={(agentId) => goToLeads({ assigneeId: agentId })}
        />

        <div className="min-w-0 xl:col-span-2">
          <AgentWorkloadChart
            data={workloadQuery.data}
            statuses={statusTrendsQuery.data?.statuses ?? []}
            isLoading={workloadQuery.isLoading || statusTrendsQuery.isLoading}
            onSegmentClick={(agentId, statusKey) =>
              goToLeads({ assigneeId: agentId, status: statusKey })
            }
          />
        </div>

        <div className="min-w-0 xl:col-span-2">
          <StatusTrendChart
            data={statusTrendsQuery.data}
            isLoading={statusTrendsQuery.isLoading}
          />
        </div>

        <SlaAgingChart
          data={slaAgingQuery.data}
          isLoading={slaAgingQuery.isLoading}
        />
        <ProjectComparisonChart
          data={projectComparisonQuery.data}
          isLoading={projectComparisonQuery.isLoading}
        />
      </div>
    </div>
  );
}
