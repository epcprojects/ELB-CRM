'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ResponseTimeSummary } from '../../../app/(main-pages)/dashboard/dashboard-analytics.data';

type ResponseTimeChartProps = {
  data?: ResponseTimeSummary;
  isLoading: boolean;
};

export default function ResponseTimeChart({ data, isLoading }: ResponseTimeChartProps) {
  if (isLoading) {
    return <div className="h-64 animate-pulse rounded-xl bg-gray-100" />;
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="mb-3 text-sm font-semibold text-gray-900">Time to first reply</p>
      <div className="mb-3 grid grid-cols-3 gap-2">
        <StatTile label="Average" value={formatMinutes(data?.avgMinutes)} />
        <StatTile label="Median" value={formatMinutes(data?.medianMinutes)} />
        <StatTile label="P90" value={formatMinutes(data?.p90Minutes)} />
      </div>
      {!data || data.sampleSize === 0 ? (
        <div className="flex h-40 items-center justify-center text-sm text-gray-500">
          No replies in this range yet.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data.buckets} margin={{ left: -16 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="count" name="Leads" fill="#1175F9" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function formatMinutes(value?: number | null) {
  if (value == null) return '-';
  if (value < 60) return `${value}m`;
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-gray-50 p-2.5">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-lg font-semibold text-gray-900">{value}</p>
    </div>
  );
}
