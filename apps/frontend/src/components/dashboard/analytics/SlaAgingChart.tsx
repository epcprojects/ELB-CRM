'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { SlaAging } from '../../../app/(main-pages)/dashboard/dashboard-analytics.data';

type SlaAgingChartProps = {
  data?: SlaAging;
  isLoading: boolean;
};

export default function SlaAgingChart({ data, isLoading }: SlaAgingChartProps) {
  if (isLoading) {
    return <div className="h-64 animate-pulse rounded-xl bg-gray-100" />;
  }

  return (
    <div className="flex h-full flex-col xl:rounded-xl border border-transparent xl:border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-900">Lead aging</p>
        <p className="text-xs text-gray-500">{data?.totalOpen ?? 0} open leads</p>
      </div>
      {!data || data.totalOpen === 0 ? (
        <div className="flex min-h-40 flex-1 items-center justify-center text-sm text-gray-500">
          No open leads for this filter.
        </div>
      ) : (
        <div className="min-h-[200px] flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.buckets} margin={{ left: -16 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" name="Open leads" fill="#F79009" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      {data && data.overdueCount > 0 ? (
        <p className="mt-3 text-sm font-medium text-red-600">
          {data.overdueCount} lead{data.overdueCount === 1 ? '' : 's'} past due date
        </p>
      ) : null}
    </div>
  );
}
