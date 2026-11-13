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
import type { AgentWorkload } from '../../../app/(main-pages)/dashboard/dashboard-analytics.data';

type StatusMeta = { key: string; label: string; color: string };

type AgentWorkloadChartProps = {
  data?: AgentWorkload[];
  statuses: StatusMeta[];
  isLoading: boolean;
  onSegmentClick?: (agentId: string, statusKey: string) => void;
};

export default function AgentWorkloadChart({
  data,
  statuses,
  isLoading,
  onSegmentClick,
}: AgentWorkloadChartProps) {
  if (isLoading) {
    return <div className="h-64 animate-pulse xl:rounded-xl bg-gray-100" />;
  }

  const rows = (data ?? []).map((agent) => {
    const row: Record<string, string | number> = {
      agentId: agent.agentId,
      fullName: agent.fullName,
    };
    for (const status of statuses) {
      row[status.key] = agent.byStatus[status.key] ?? 0;
    }
    return row;
  });

  if (rows.length === 0) {
    return <EmptyChartState />;
  }

  return (
    <div className="xl:rounded-xl border border-transparent xl:border-gray-200 bg-white p-4">
      <p className="mb-3 text-sm font-semibold text-gray-900">Agent workload</p>
      <ResponsiveContainer width="100%" height={Math.max(160, rows.length * 40 + 60)}>
        <BarChart data={rows} layout="vertical" margin={{ left: 24 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" allowDecimals={false} />
          <YAxis type="category" dataKey="fullName" width={100} />
          <Tooltip />
          <Legend />
          {statuses.map((status) => (
            <Bar
              key={status.key}
              dataKey={status.key}
              name={status.label}
              stackId="status"
              fill={status.color || '#673DE6'}
              cursor={onSegmentClick ? 'pointer' : undefined}
              onClick={(_, index) => {
                const row = rows[index];
                if (row && onSegmentClick) onSegmentClick(String(row.agentId), status.key);
              }}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function EmptyChartState() {
  return (
    <div className="flex h-48 items-center justify-center rounded-xl border border-gray-200 bg-white text-sm text-gray-500">
      No workload data for this filter.
    </div>
  );
}
