'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ProjectOverviewRow } from '../../../app/(main-pages)/dashboard/dashboard-analytics.data';

type ProjectOverviewCardProps = {
  data?: ProjectOverviewRow[];
  isLoading: boolean;
  onProjectClick?: (projectId: string) => void;
};

export default function ProjectOverviewCard({
  data,
  isLoading,
  onProjectClick,
}: ProjectOverviewCardProps) {
  if (isLoading) {
    return <div className="h-80 animate-pulse rounded-xl bg-gray-100" />;
  }

  const rows = data ?? [];
  // Every project's statusBreakdown carries the same full, ordered status
  // list (zero-count statuses included), so the first row's list is enough
  // to know which status segments to draw.
  const statuses = rows[0]?.statusBreakdown ?? [];

  const chartRows = rows.map((project) => {
    const row: Record<string, string | number> = {
      projectId: project.projectId,
      projectName: project.projectName,
    };
    for (const status of project.statusBreakdown) {
      row[status.key] = status.count;
    }
    return row;
  });

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="mb-3 text-sm font-semibold text-gray-900">Projects</p>
      {rows.length === 0 ? (
        <div className="flex h-40 items-center justify-center text-sm text-gray-500">
          No projects for this filter.
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={Math.max(160, chartRows.length * 40 + 60)}>
            <BarChart data={chartRows} layout="vertical" margin={{ left: 24 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" allowDecimals={false} />
              <YAxis type="category" dataKey="projectName" width={140} />
              <Tooltip />
              <Legend />
              {statuses.map((status) => (
                <Bar
                  key={status.key}
                  dataKey={status.key}
                  name={status.label}
                  stackId="status"
                  fill={status.color || '#673DE6'}
                  cursor={onProjectClick ? 'pointer' : undefined}
                  onClick={(_, index) => {
                    const row = chartRows[index];
                    if (row && onProjectClick) onProjectClick(String(row.projectId));
                  }}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>

          <div className="mt-3 divide-y divide-gray-100 text-sm">
            {rows.map((project) => (
              <button
                key={project.projectId}
                type="button"
                onClick={() => onProjectClick?.(project.projectId)}
                className="flex w-full items-center justify-between gap-2 py-1.5 text-left hover:bg-gray-50"
              >
                <span className="truncate text-gray-800">{project.projectName}</span>
                <span className="shrink-0 text-xs text-gray-500">
                  {project.totalLeads} leads &middot; {project.agentCount} agent
                  {project.agentCount === 1 ? '' : 's'} &middot; {project.openCount} open
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
