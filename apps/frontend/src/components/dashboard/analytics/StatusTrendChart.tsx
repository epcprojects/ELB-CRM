'use client';

import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { StatusTrends } from '../../../app/(main-pages)/dashboard/dashboard-analytics.data';

type StatusTrendChartProps = {
  data?: StatusTrends;
  isLoading: boolean;
};

export default function StatusTrendChart({ data, isLoading }: StatusTrendChartProps) {
  const [series, setSeries] = useState<'createdVolume' | 'transitions'>('createdVolume');

  const rows = useMemo(() => {
    if (!data) return [];
    const points = data[series];
    const byBucket = new Map<string, Record<string, string | number>>();
    for (const point of points) {
      const key = point.bucket;
      const row = byBucket.get(key) ?? { bucket: formatBucketLabel(key) };
      row[point.statusKey] = point.count;
      byBucket.set(key, row);
    }
    return Array.from(byBucket.values());
  }, [data, series]);

  if (isLoading) {
    return <div className="h-64 animate-pulse zl:rounded-xl bg-gray-100" />;
  }

  const statuses = data?.statuses ?? [];

  return (
    <div className="xl:rounded-xl border border-transparent xl:border-gray-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-gray-900">Lead volume trend by status</p>
        <div className="flex gap-1 rounded-lg bg-gray-100 p-1 text-xs">
          <ToggleButton active={series === 'createdVolume'} onClick={() => setSeries('createdVolume')}>
            Leads created
          </ToggleButton>
          <ToggleButton active={series === 'transitions'} onClick={() => setSeries('transitions')}>
            Status changes
          </ToggleButton>
        </div>
      </div>
      {series === 'transitions' ? (
        <p className="mb-2 text-xs text-gray-500">
          Only reflects status changes made after this feature shipped.
        </p>
      ) : null}
      {rows.length === 0 ? (
        <div className="flex h-48 items-center justify-center text-sm text-gray-500">
          No trend data for this range.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={rows}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="bucket" />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Legend />
            {statuses.map((status) => (
              <Area
                key={status.key}
                type="monotone"
                dataKey={status.key}
                name={status.label}
                stackId="1"
                stroke={status.color || '#673DE6'}
                fill={status.color || '#673DE6'}
                fillOpacity={0.25}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
        active ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
      }`}
    >
      {children}
    </button>
  );
}

function formatBucketLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
}
