/**
 * NotificationBell Component
 *
 * Header interactive widget displaying an unread notification count badge
 * and a floating popover list of recent operational notifications.
 *
 * Features:
 * - Real-time polling via `useUnreadCount` and `useNotifications`.
 * - Event category icons: Distinct visual color/icon for assignments, status changes,
 *   approval requests, approval decisions, comments, and account approval events.
 * - Interaction ergonomics:
 *   - Auto-closes on outside click or Escape key press.
 *   - Marks notification as read upon clicking item link.
 *   - Filter tabs: Toggle between "All" and "Unread only".
 *   - Batch actions: "Mark all read" mutation.
 *   - Hover actions: Quick mark as read and delete buttons.
 */

import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  Check,
  CheckCheck,
  Trash2,
  UserCheck,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  MessageSquare,
  ShieldCheck,
  ExternalLink,
} from "lucide-react";
import {
  useDeleteNotification,
  useMarkAllAsRead,
  useMarkAsRead,
  useNotifications,
  useUnreadCount,
} from "@/hooks/use-notifications";
import { formatRelativeTime } from "@/lib/utils";
import type { Notification } from "@/types";

/**
 * Returns a styled icon container corresponding to the notification category.
 *
 * @param type - The NotificationType string (e.g. ASSIGNMENT, STATUS_CHANGE, COMMENT).
 * @returns React node representing the badge icon.
 */
export function getNotificationIcon(type: string) {
  switch (type) {
    case "ASSIGNMENT":
      return (
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-100 text-purple-600">
          <UserCheck className="h-4 w-4" />
        </div>
      );
    case "STATUS_CHANGE":
      return (
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-600">
          <RefreshCw className="h-4 w-4" />
        </div>
      );
    case "APPROVAL_REQUESTED":
      return (
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-amber-600">
          <AlertCircle className="h-4 w-4" />
        </div>
      );
    case "APPROVAL_DECISION":
      return (
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          <CheckCircle2 className="h-4 w-4" />
        </div>
      );
    case "COMMENT":
      return (
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-100 text-sky-600">
          <MessageSquare className="h-4 w-4" />
        </div>
      );
    case "USER_APPROVAL":
      return (
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-100 text-teal-600">
          <ShieldCheck className="h-4 w-4" />
        </div>
      );
    default:
      return (
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-600">
          <Bell className="h-4 w-4" />
        </div>
      );
  }
}

/**
 * Bell button with dynamic badge and floating popover notification inbox.
 */
export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [filterUnread, setFilterUnread] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Fetch unread count for badge display
  const { data: unreadData } = useUnreadCount();
  const unreadCount = unreadData?.unread_count ?? 0;

  // Query recent notifications with optional unread-only filtering
  const { data, isLoading } = useNotifications({
    unreadOnly: filterUnread,
    pageSize: 15,
  });

  const markAsReadMutation = useMarkAsRead();
  const markAllAsReadMutation = useMarkAllAsRead();
  const deleteNotificationMutation = useDeleteNotification();

  // Close dropdown on outside click or Escape key press
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const notifications = data?.items ?? [];

  /**
   * Handle user clicking a notification item: marks as read and navigates to target link.
   */
  const handleNotificationClick = (item: Notification) => {
    if (!item.is_read) {
      markAsReadMutation.mutate(item.id);
    }
    if (item.link) {
      navigate(item.link);
      setIsOpen(false);
    }
  };

  return (
    <div className="relative" ref={popoverRef}>
      {/* Bell Button with numeric unread counter */}
      <button
        type="button"
        id="notification-bell-btn"
        aria-label="Notifications"
        onClick={() => setIsOpen((prev) => !prev)}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white shadow-sm ring-2 ring-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Popover */}
      {isOpen && (
        <div
          id="notification-popover"
          className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl border border-slate-200 bg-white shadow-xl ring-1 ring-black/5 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100"
        >
          {/* Popover Header */}
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 bg-slate-50/70">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-900 text-sm">Notifications</span>
              {unreadCount > 0 && (
                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700">
                  {unreadCount} new
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => markAllAsReadMutation.mutate()}
                disabled={markAllAsReadMutation.isPending}
                className="flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 transition"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                <span>Mark all read</span>
              </button>
            )}
          </div>

          {/* Filter Tabs: All vs Unread Only */}
          <div className="flex border-b border-slate-100 px-3 pt-2 gap-2 text-xs">
            <button
              type="button"
              onClick={() => setFilterUnread(false)}
              className={`pb-2 px-2 font-medium border-b-2 transition ${
                !filterUnread
                  ? "border-slate-900 text-slate-900"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setFilterUnread(true)}
              className={`pb-2 px-2 font-medium border-b-2 transition ${
                filterUnread
                  ? "border-slate-900 text-slate-900"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              Unread only ({unreadCount})
            </button>
          </div>

          {/* Notifications List */}
          <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-100">
            {isLoading ? (
              <div className="flex items-center justify-center p-8 text-xs text-slate-400">
                Loading notifications...
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 mb-2">
                  <Check className="h-5 w-5" />
                </div>
                <p className="text-sm font-medium text-slate-700">All caught up!</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {filterUnread
                    ? "No unread notifications to display."
                    : "No notifications in your inbox yet."}
                </p>
              </div>
            ) : (
              notifications.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleNotificationClick(item)}
                  className={`group relative flex items-start gap-3 p-3.5 transition cursor-pointer hover:bg-slate-50/80 ${
                    !item.is_read ? "bg-blue-50/30" : ""
                  }`}
                >
                  {/* Category Icon */}
                  <div className="shrink-0 mt-0.5">
                    {getNotificationIcon(item.type)}
                  </div>

                  {/* Text Content */}
                  <div className="flex-1 min-w-0 pr-6">
                    <div className="flex items-center gap-1.5">
                      <p
                        className={`text-xs font-semibold truncate ${
                          !item.is_read ? "text-slate-900" : "text-slate-700"
                        }`}
                      >
                        {item.title}
                      </p>
                      {!item.is_read && (
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-600 shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-slate-600 line-clamp-2 mt-0.5">
                      {item.message}
                    </p>
                    <span className="text-[11px] text-slate-400 mt-1 block">
                      {formatRelativeTime(item.created_at)}
                    </span>
                  </div>

                  {/* Quick Action buttons (revealed on item hover) */}
                  <div
                    className="absolute right-2 top-2 hidden group-hover:flex items-center gap-1 bg-white/90 p-1 rounded-md shadow-sm border border-slate-100"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {!item.is_read && (
                      <button
                        type="button"
                        title="Mark as read"
                        onClick={() => markAsReadMutation.mutate(item.id)}
                        className="p-1 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                      >
                        <Check className="h-3 w-3" />
                      </button>
                    )}
                    <button
                      type="button"
                      title="Delete notification"
                      onClick={() => deleteNotificationMutation.mutate(item.id)}
                      className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Popover Footer: Link to full inbox page */}
          <div className="border-t border-slate-100 p-2 text-center bg-slate-50/50">
            <button
              type="button"
              onClick={() => {
                navigate("/notifications");
                setIsOpen(false);
              }}
              className="inline-flex items-center justify-center gap-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 py-1 px-3 rounded hover:bg-slate-100 transition w-full"
            >
              <span>View all notifications</span>
              <ExternalLink className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
