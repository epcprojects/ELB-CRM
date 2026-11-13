'use client';

import ThemeInput from '../../ui/ThemeInput';
import Dropdown from '../../ui/ThemeDropDown';
import type { AnalyticsFilters } from '../../../app/(main-pages)/dashboard/dashboard-analytics.data';

type AnalyticsFilterBarProps = {
  filters: AnalyticsFilters;
  onChange: (next: AnalyticsFilters) => void;
  projectOptions: { id: string; name: string }[];
  agentOptions: { id: string; fullName: string }[];
  canFilterByAgent: boolean;
};

const GRANULARITY_OPTIONS = [
  { label: 'Daily', value: 'day' },
  { label: 'Weekly', value: 'week' },
  { label: 'Monthly', value: 'month' },
];

export default function AnalyticsFilterBar({
  filters,
  onChange,
  projectOptions,
  agentOptions,
  canFilterByAgent,
}: AnalyticsFilterBarProps) {
  return (
    <div className="flex flex-wrap items-end gap-3  xl:rounded-xl border border-transparent xl:border-gray-200 bg-white p-3">
      <div className="w-full xl:w-40 shrink-0">
        <ThemeInput
          label="From"
          type="date"
          value={filters.dateFrom ?? ''}
          onChange={(event) => onChange({ ...filters, dateFrom: event.target.value || undefined })}
        />
      </div>
      <div className="w-full xl:w-40 shrink-0">
        <ThemeInput
          label="To"
          type="date"
          value={filters.dateTo ?? ''}
          onChange={(event) => onChange({ ...filters, dateTo: event.target.value || undefined })}
        />
      </div>
      <Dropdown
        label="Projects"
        width="w-full md:w-56"
        isMulti
        placeholder="All projects"
        value={filters.projectIds ?? []}
        onChange={(projectIds) => onChange({ ...filters, projectIds: projectIds.length ? projectIds : undefined })}
        options={projectOptions.map((project) => ({ label: project.name, value: project.id }))}
        showSearch
      />
      <div className='flex flex-col md:flex-row gap-3 w-full md:w-auto'>
        {canFilterByAgent ? (
        <Dropdown
          label="Agent"
          width="w-full md:w-48"
          placeholder="All agents"
          value={filters.agentId ?? ''}
          onChange={(agentId) => onChange({ ...filters, agentId: agentId || undefined })}
          options={[
            { label: 'All agents', value: '' },
            ...agentOptions.map((agent) => ({ label: agent.fullName, value: agent.id })),
          ]}
          showSearch
        />
      ) : null}
      <Dropdown
        label="Trend granularity"
        width="w-full md:w-36"
        placeholder="Weekly"
        value={filters.granularity ?? 'week'}
        onChange={(granularity) =>
          onChange({ ...filters, granularity: granularity as AnalyticsFilters['granularity'] })
        }
        options={GRANULARITY_OPTIONS}
      />
      </div>
    </div>
  );
}
