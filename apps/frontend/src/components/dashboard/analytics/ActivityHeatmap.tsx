'use client';

import type { ActivityHeatmapCell } from '../../../app/(main-pages)/dashboard/dashboard-analytics.data';

type ActivityHeatmapProps = {
  data?: ActivityHeatmapCell[];
  isLoading: boolean;
};

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function ActivityHeatmap({ data, isLoading }: ActivityHeatmapProps) {
  if (isLoading) {
    return <div className="h-64 animate-pulse rounded-xl bg-gray-100" />;
  }

  const cells = data ?? [];
  const max = Math.max(1, ...cells.map((cell) => cell.count));
  const countByKey = new Map(cells.map((cell) => [`${cell.dayOfWeek}-${cell.hour}`, cell.count]));

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="mb-3 text-sm font-semibold text-gray-900">Busiest reply times</p>
      {cells.length === 0 ? (
        <div className="flex h-40 items-center justify-center text-sm text-gray-500">
          No agent replies recorded for this filter.
        </div>
      ) : (
        <div className="space-y-1 overflow-x-auto">
          {DAY_LABELS.map((label, dayOfWeek) => (
            <div key={label} className="flex items-center gap-1.5">
              <span className="w-8 shrink-0 text-xs text-gray-500">{label}</span>
              <div className="flex flex-1 gap-0.5">
                {Array.from({ length: 24 }, (_, hour) => {
                  const count = countByKey.get(`${dayOfWeek}-${hour}`) ?? 0;
                  const alpha = count === 0 ? 0.06 : 0.15 + 0.75 * (count / max);
                  return (
                    <div
                      key={hour}
                      title={`${label} ${hour}:00 - ${count} replies`}
                      className="h-3.5 flex-1 rounded-[2px]"
                      style={{ backgroundColor: `rgba(103, 61, 230, ${alpha})` }}
                    />
                  );
                })}
              </div>
            </div>
          ))}
          <p className="pl-10 text-xs text-gray-400">Midnight to 11pm, local time</p>
        </div>
      )}
    </div>
  );
}
