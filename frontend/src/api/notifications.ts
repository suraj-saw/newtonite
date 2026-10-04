/**
 * In-App Notification API Service
 *
 * Provides typed functions for fetching paginated notifications,
 * polling unread counts, marking items read, and dismissing alerts.
 */

import { api } from "./client";
import type { Notification, NotificationListResponse, UnreadCountResponse } from "@/types";

/**
 * Filter and pagination query parameters for notification listing.
 */
export interface GetNotificationsParams {
  unreadOnly?: boolean;
  page?: number;
  pageSize?: number;
}

/**
 * Fetch paginated notification records for the current user.
 */
export async function fetchNotifications(params: GetNotificationsParams = {}): Promise<NotificationListResponse> {
  const query = new URLSearchParams();
  if (params.unreadOnly) {
    query.set("unread_only", "true");
  }
  if (params.page) {
    query.set("page", String(params.page));
  }
  if (params.pageSize) {
    query.set("page_size", String(params.pageSize));
  }
  const queryString = query.toString() ? `?${query.toString()}` : "";
  return api.get<NotificationListResponse>(`/notifications${queryString}`);
}

/**
 * Fetch the lightweight unread notification count polled by the header bell badge.
 */
export async function fetchUnreadCount(): Promise<UnreadCountResponse> {
  return api.get<UnreadCountResponse>("/notifications/unread-count");
}

/**
 * Mark a single notification item as read.
 */
export async function markNotificationAsRead(id: number): Promise<Notification> {
  return api.patch<Notification>(`/notifications/${id}/read`, {});
}

/**
 * Mark all notifications for the current user as read.
 */
export async function markAllNotificationsAsRead(): Promise<{ ok: boolean; count: number }> {
  return api.post<{ ok: boolean; count: number }>("/notifications/mark-all-read");
}

/**
 * Permanently dismiss/delete a notification record.
 */
export async function deleteNotification(id: number): Promise<void> {
  return api.delete(`/notifications/${id}`);
}

