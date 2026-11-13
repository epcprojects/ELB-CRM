'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ProjectComparisonRow } from '../../../app/(main-pages)/dashboard/dashboard-analytics.data';

type ProjectComparisonChartProps = {
  data?: ProjectComparisonRow[];
  isLoading: boolean;
};

export default function ProjectComparisonChart({ data, isLoading }: ProjectComparisonChartProps) {
  if (isLoading) {
    return <div className="h-64 animate-pulse rounded-xl bg-gray-100" />;
  }

  const rows = data ?? [];

  return (
    <div className="xl:rounded-xl border border-transparent xl:border-gray-200 bg-white p-4">
      <p className="mb-3 text-sm font-semibold text-gray-900">Project comparison</p>
      {rows.length === 0 ? (
        <div className="flex h-48 items-center justify-center text-sm text-gray-500">
          No project data for this filter.
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={Math.max(160, rows.length * 40 + 40)}>
            <BarChart data={rows} layout="vertical" margin={{ left: 24 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} unit="%" />
              <YAxis type="category" dataKey="projectName" width={120} />
              <Tooltip formatter={(value: number) => `${value}%`} />
              <Bar dataKey="closeRate" name="Close rate" fill="#5906CE" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-3 divide-y divide-gray-100 text-sm">
            {rows.map((project) => (
              <div key={project.projectId} className="flex items-center justify-between py-1.5">
                <span className="text-gray-800">{project.projectName}</span>
                <span className="text-gray-500">
                  {project.totalLeads} leads
                  {project.avgFirstResponseMinutes != null
                    ? ` - avg reply ${project.avgFirstResponseMinutes}m`
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
