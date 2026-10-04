/**
 * TanStack React Query Data Hooks
 *
 * Provides declarative data-fetching hooks with automated caching,
 * window-focus re-synchronization, and query key management.
 */

import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { DashboardSummary, Paginated, Team, User, WorkItem, Comment, Activity } from "@/types";

/**
 * Fetch real-time dashboard analytical metrics and distributions.
 */
export function useDashboard() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.get<DashboardSummary>("/dashboard/summary"),
  });
}

/**
 * Fetch paginated and filtered work items matching URL query parameters.
 */
export function useWorkItems(params: URLSearchParams) {
  const qs = params.toString();
  return useQuery({
    queryKey: ["work-items", qs],
    queryFn: () => api.get<Paginated<WorkItem>>(`/work-items${qs ? `?${qs}` : ""}`),
  });
}

/**
 * Fetch detailed record of a single work item with automatic window-focus refresh
 * to detect concurrent modifications.
 */
export function useWorkItem(id: string | undefined, options?: { refetchInterval?: number | false }) {
  return useQuery({
    queryKey: ["work-item", id],
    queryFn: () => api.get<WorkItem>(`/work-items/${id}`),
    enabled: Boolean(id),
    refetchOnWindowFocus: true,
    refetchInterval: options?.refetchInterval,
  });
}

/**
 * Fetch all discussion comments for a specific work item.
 */
export function useComments(id: string | undefined) {
  return useQuery({
    queryKey: ["comments", id],
    queryFn: () => api.get<Comment[]>(`/work-items/${id}/comments`),
    enabled: Boolean(id),
  });
}

/**
 * Fetch the immutable audit trail history for a work item.
 */
export function useActivity(id: string | undefined) {
  return useQuery({
    queryKey: ["activity", id],
    queryFn: () => api.get<Activity[]>(`/work-items/${id}/activity`),
    enabled: Boolean(id),
  });
}

/**
 * Fetch all operational teams across the organization.
 */
export function useTeams() {
  return useQuery({ queryKey: ["teams"], queryFn: () => api.get<Team[]>("/teams") });
}

/**
 * Fetch detailed team record and member roster.
 */
export function useTeamDetail(id: number | undefined) {
  return useQuery({
    queryKey: ["team", id],
    queryFn: () => api.get<import("@/types").TeamDetail>(`/teams/${id}`),
    enabled: Boolean(id),
  });
}

/**
 * Fetch all employee accounts (Admin view).
 */
export function useUsers() {
  return useQuery({ queryKey: ["users"], queryFn: () => api.get<User[]>("/users") });
}

/**
 * Fetch profile and team permissions of the authenticated user.
 */
export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => api.get<User>("/auth/me"),
  });
}

