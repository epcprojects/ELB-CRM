'use client';

import { useQuery } from '@tanstack/react-query';
import {
  fetchActivityHeatmap,
  fetchAgentPerformance,
  fetchAgentRoster,
  fetchAgentWorkload,
  fetchProjectComparison,
  fetchProjectOverview,
  fetchResponseTime,
  fetchSlaAging,
  fetchStatusTrends,
  type AnalyticsFilters,
} from './dashboard-analytics.data';

export const analyticsQueryKey = ['dashboard-analytics'];

function filterKey(filters: AnalyticsFilters) {
  return [
    filters.dateFrom ?? '',
    filters.dateTo ?? '',
    filters.agentId ?? '',
    filters.granularity ?? '',
    ...(filters.projectIds ?? []),
  ];
}

export function useAgentRosterQuery(filters: AnalyticsFilters, enabled = true) {
  return useQuery({
    queryKey: [...analyticsQueryKey, 'roster', ...filterKey(filters)],
    queryFn: () => fetchAgentRoster(filters),
    enabled,
  });
}

export function useAgentWorkloadQuery(filters: AnalyticsFilters, enabled = true) {
  return useQuery({
    queryKey: [...analyticsQueryKey, 'workload', ...filterKey(filters)],
    queryFn: () => fetchAgentWorkload(filters),
    enabled,
  });
}

export function useAgentPerformanceQuery(filters: AnalyticsFilters, enabled = true) {
  return useQuery({
    queryKey: [...analyticsQueryKey, 'performance', ...filterKey(filters)],
    queryFn: () => fetchAgentPerformance(filters),
    enabled,
  });
}

export function useResponseTimeQuery(filters: AnalyticsFilters, enabled = true) {
  return useQuery({
    queryKey: [...analyticsQueryKey, 'response-time', ...filterKey(filters)],
    queryFn: () => fetchResponseTime(filters),
    enabled,
  });
}

export function useStatusTrendsQuery(filters: AnalyticsFilters, enabled = true) {
  return useQuery({
    queryKey: [...analyticsQueryKey, 'status-trends', ...filterKey(filters)],
    queryFn: () => fetchStatusTrends(filters),
    enabled,
  });
}

export function useSlaAgingQuery(filters: AnalyticsFilters, enabled = true) {
  return useQuery({
    queryKey: [...analyticsQueryKey, 'sla-aging', ...filterKey(filters)],
    queryFn: () => fetchSlaAging(filters),
    enabled,
  });
}

export function useActivityHeatmapQuery(filters: AnalyticsFilters, enabled = true) {
  return useQuery({
    queryKey: [...analyticsQueryKey, 'activity-heatmap', ...filterKey(filters)],
    queryFn: () => fetchActivityHeatmap(filters),
    enabled,
  });
}

export function useProjectComparisonQuery(filters: AnalyticsFilters, enabled = true) {
  return useQuery({
    queryKey: [...analyticsQueryKey, 'project-comparison', ...filterKey(filters)],
    queryFn: () => fetchProjectComparison(filters),
    enabled,
  });
}

export function useProjectOverviewQuery(filters: AnalyticsFilters, enabled = true) {
  return useQuery({
    queryKey: [...analyticsQueryKey, 'project-overview', ...filterKey(filters)],
    queryFn: () => fetchProjectOverview(filters),
    enabled,
  });
}
