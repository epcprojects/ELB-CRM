'use client';

import type { AgentRoster } from '../../../app/(main-pages)/dashboard/dashboard-analytics.data';

type AgentRosterCardProps = {
  data?: AgentRoster;
  isLoading: boolean;
  canViewTeam: boolean;
  onAgentClick?: (agentId: string) => void;
};

export default function AgentRosterCard({
  data,
  isLoading,
  canViewTeam,
  onAgentClick,
}: AgentRosterCardProps) {
  if (isLoading) {
    return <div className="h-48 animate-pulse xl:rounded-xl bg-gray-100" />;
  }

  return (
    <div className="flex h-full flex-col xl:rounded-xl border border-transparent xl:border-gray-200 bg-white p-4">
      <p className="mb-3 text-sm font-semibold text-gray-900">Agents</p>
      <div className="grid grid-cols-4 gap-2">
        <StatTile label="Total" value={data?.totalAgents ?? 0} />
        <StatTile label="Active" value={data?.active ?? 0} color="#17B26A" />
        <StatTile label="Inactive" value={data?.inactive ?? 0} color="#667085" />
        <StatTile label="Pending" value={data?.pendingInvite ?? 0} color="#F79009" />
      </div>
      {canViewTeam ? (
        <div className="mt-4 min-h-56 flex-1 space-y-1.5 overflow-y-auto">
          {(data?.agents ?? []).map((agent) => (
            <button
              key={agent.id}
              type="button"
              onClick={() => onAgentClick?.(agent.id)}
              className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-gray-50"
            >
              <span className="flex min-w-0 items-start gap-2">
                <span
                  className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: agent.isActive ? '#17B26A' : '#D0D5DD' }}
                />
                <span className="min-w-0">
                  <span className="block truncate text-gray-800">{agent.fullName}</span>
                  <span className="block truncate text-xs text-gray-400">
                    {agent.projects.length
                      ? agent.projects.map((p) => p.name).join(', ')
                      : 'No projects assigned'}
                  </span>
                </span>
              </span>
              <span className="shrink-0 text-xs text-gray-500">
                {agent.openLeadCount} open
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function StatTile({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded-lg bg-gray-50 p-2.5">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-lg font-semibold" style={color ? { color } : undefined}>
        {value}
      </p>
    </div>
  );
}
