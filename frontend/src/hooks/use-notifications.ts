/**
 * Notification Query and Mutation Hooks
 *
 * Provides hooks for polling unread alerts, fetching notification lists,
 * and performing optimistic/invalidating cache mutations.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteNotification,
  fetchNotifications,
  fetchUnreadCount,
  GetNotificationsParams,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from "@/api/notifications";

/**
 * Fetch paginated list of notifications for the current user.
 */
export function useNotifications(params: GetNotificationsParams = {}) {
  return useQuery({
    queryKey: ["notifications", params],
    queryFn: () => fetchNotifications(params),
    refetchOnWindowFocus: true,
  });
}

/**
 * Poll unread notification count every 15 seconds to update the header bell badge.
 */
export function useUnreadCount(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: fetchUnreadCount,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    enabled: options?.enabled ?? true,
  });
}

/**
 * Mutation to mark a single notification as read, invalidating cached notification queries.
 */
export function useMarkAsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => markNotificationAsRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

/**
 * Mutation to mark all notifications as read.
 */
export function useMarkAllAsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => markAllNotificationsAsRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

/**
 * Mutation to delete/dismiss a notification record.
 */
export function useDeleteNotification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteNotification(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

