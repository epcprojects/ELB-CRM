'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AgentPerformance } from '../../../app/(main-pages)/dashboard/dashboard-analytics.data';

type AgentPerformanceLeaderboardProps = {
  data?: AgentPerformance[];
  isLoading: boolean;
  onAgentClick?: (agentId: string) => void;
};

export default function AgentPerformanceLeaderboard({
  data,
  isLoading,
  onAgentClick,
}: AgentPerformanceLeaderboardProps) {
  if (isLoading) {
    return <div className="h-64 animate-pulse rounded-xl bg-gray-100" />;
  }

  const rows = data ?? [];

  return (
    <div className="xl:rounded-xl border border-transparent xl:border-gray-200 bg-white p-4">
      <p className="mb-3 text-sm font-semibold text-gray-900">
        Agent performance leaderboard
      </p>
      {rows.length === 0 ? (
        <div className="flex h-48 items-center justify-center text-sm text-gray-500">
          No performance data for this filter.
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={Math.max(160, rows.length * 36 + 40)}>
            <BarChart data={rows} layout="vertical" margin={{ left: 24 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} unit="%" />
              <YAxis type="category" dataKey="fullName" width={100} />
              <Tooltip formatter={(value: number) => `${value}%`} />
              <Bar
                dataKey="closeRate"
                name="Close rate"
                fill="#673DE6"
                radius={[0, 4, 4, 0]}
                cursor={onAgentClick ? 'pointer' : undefined}
                onClick={(_, index) => {
                  const row = rows[index];
                  if (row && onAgentClick) onAgentClick(row.agentId);
                }}
              />
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-3 divide-y divide-gray-100 text-sm">
            {rows.map((agent) => (
              <div key={agent.agentId} className="flex items-center justify-between py-1.5">
                <span className="text-gray-800">{agent.fullName}</span>
                <span className="text-gray-500">
                  {agent.closedCount}/{agent.totalAssigned} closed
                  {agent.avgFirstResponseMinutes != null
                    ? ` - avg reply ${agent.avgFirstResponseMinutes}m`
                    : ''}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
