/**
 * NotificationsPage Component
 *
 * Dedicated notification inbox view for reviewing, searching, and managing all user notifications.
 *
 * Capabilities:
 * - Paginated fetching of user notifications via `useNotifications`.
 * - Multi-criteria filtering: Unread only, event type category (ASSIGNMENT, STATUS_CHANGE, COMMENT, etc.),
 *   and real-time title/message search query filter.
 * - Batch operations: Mark all notifications as read.
 * - Single-item operations: Mark single notification as read, delete notification, and deep-link navigation.
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Bell,
  Check,
  CheckCheck,
  Trash2,
  ExternalLink,
  Search,
  Filter,
} from "lucide-react";
import {
  useDeleteNotification,
  useMarkAllAsRead,
  useMarkAsRead,
  useNotifications,
} from "@/hooks/use-notifications";
import { formatDate, formatRelativeTime } from "@/lib/utils";
import { getNotificationIcon } from "@/components/notifications/NotificationBell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

/**
 * Full notification inbox page component.
 */
export function NotificationsPage() {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const { data, isLoading } = useNotifications({
    unreadOnly,
    page,
    pageSize,
  });

  const markAsReadMutation = useMarkAsRead();
  const markAllAsReadMutation = useMarkAllAsRead();
  const deleteNotificationMutation = useDeleteNotification();

  const rawNotifications = data?.items ?? [];
  const total = data?.total ?? 0;
  const unreadCount = data?.unread_count ?? 0;
  const totalPages = Math.ceil(total / pageSize) || 1;

  // Filter client-side by type and search query if provided
  const notifications = rawNotifications.filter((item) => {
    if (typeFilter !== "ALL" && item.type !== typeFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        item.title.toLowerCase().includes(q) ||
        item.message.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Notifications
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Stay informed on assignments, approvals, status updates, and team discussions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Button
              variant="secondary"
              onClick={() => markAllAsReadMutation.mutate()}
              disabled={markAllAsReadMutation.isPending}
              className="flex items-center gap-1.5 text-xs"
            >
              <CheckCheck className="h-4 w-4" />
              <span>Mark all as read ({unreadCount})</span>
            </Button>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-border shadow-sm">
        {/* Status Tabs */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
          <button
            type="button"
            onClick={() => {
              setUnreadOnly(false);
              setPage(1);
            }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${
              !unreadOnly
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            All ({total})
          </button>
          <button
            type="button"
            onClick={() => {
              setUnreadOnly(true);
              setPage(1);
            }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition flex items-center gap-1.5 ${
              unreadOnly
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <span>Unread</span>
            {unreadCount > 0 && (
              <span className="rounded-full bg-rose-500 px-1.5 py-0.2 text-[10px] text-white font-bold">
                {unreadCount}
              </span>
            )}
          </button>
        </div>

        {/* Filter by Type & Search */}
        <div className="flex flex-col sm:flex-row items-center gap-2">
          <div className="relative w-full sm:w-56">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              type="text"
              placeholder="Search notifications..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 text-xs"
            />
          </div>

          <div className="flex items-center gap-1 w-full sm:w-auto">
            <Filter className="h-4 w-4 text-slate-400 shrink-0 hidden sm:block" />
            <Select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="text-xs"
            >
              <option value="ALL">All types</option>
              <option value="ASSIGNMENT">Assignments</option>
              <option value="STATUS_CHANGE">Status updates</option>
              <option value="APPROVAL_REQUESTED">Approval requests</option>
              <option value="APPROVAL_DECISION">Approval decisions</option>
              <option value="COMMENT">Comments</option>
              <option value="USER_APPROVAL">Account verification</option>
              <option value="SYSTEM">System</option>
            </Select>
          </div>
        </div>
      </div>

      {/* Notifications List */}
      <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden divide-y divide-border">
        {isLoading ? (
          <div className="p-12 text-center text-sm text-slate-400">
            Loading notifications...
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 mb-3">
              <Bell className="h-6 w-6" />
            </div>
            <h3 className="text-base font-semibold text-slate-800">
              No notifications found
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mt-1">
              {unreadOnly
                ? "You're all caught up! No unread notifications matching your filters."
                : "No notifications found in your inbox."}
            </p>
          </div>
        ) : (
          notifications.map((item) => (
            <div
              key={item.id}
              className={`p-4 sm:p-5 flex items-start gap-4 transition hover:bg-slate-50/70 ${
                !item.is_read ? "bg-blue-50/20" : ""
              }`}
            >
              {/* Type Icon */}
              <div className="shrink-0 mt-0.5">
                {getNotificationIcon(item.type)}
              </div>

              {/* Main Notification Details */}
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="font-semibold text-sm text-slate-900">
                    {item.title}
                  </span>
                  {!item.is_read && (
                    <span className="inline-flex items-center rounded-full bg-blue-100 text-blue-700 px-2 py-0.5 text-[10px] font-semibold">
                      New
                    </span>
                  )}
                  <span className="text-[11px] text-slate-400 font-medium ml-auto">
                    {formatRelativeTime(item.created_at)} ({formatDate(item.created_at)})
                  </span>
                </div>

                <p className="text-sm text-slate-600 leading-relaxed">
                  {item.message}
                </p>

                {/* Bottom Actions */}
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  {item.link && (
                    <Link
                      to={item.link}
                      onClick={() => {
                        if (!item.is_read) markAsReadMutation.mutate(item.id);
                      }}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 transition"
                    >
                      <span>View details</span>
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  )}

                  {!item.is_read && (
                    <button
                      type="button"
                      onClick={() => markAsReadMutation.mutate(item.id)}
                      className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 transition"
                    >
                      <Check className="h-3.5 w-3.5" />
                      <span>Mark as read</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => deleteNotificationMutation.mutate(item.id)}
                    className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-rose-600 transition ml-auto"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border pt-4">
          <p className="text-xs text-slate-500">
            Page {page} of {totalPages} ({total} total)
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="text-xs"
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="text-xs"
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
