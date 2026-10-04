/**
 * AppLayout Component
 *
 * Primary application layout shell housing the responsive sidebar navigation,
 * top operational header bar, notification bell dropdown, user badge, and
 * logout confirmation modal.
 *
 * Key Behaviors:
 * - Dynamic sidebar navigation with active path styling.
 * - Deep query parameter matching: highlights "Assigned to me" when `assignee_id` matches current user id.
 * - Unread notification badge: queries the `/notifications/unread-count` endpoint with auto-polling.
 * - Role-based administration section: conditionally displays "User Verification" and "Employee Management"
 *   routes only for users with `is_admin === true`.
 * - Graceful logout handling: sends POST `/auth/logout` to clear HTTP-only session cookies and clean up local Zustand state.
 */

import { useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/auth";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { useUnreadCount } from "@/hooks/use-notifications";

/**
 * Main application layout container enclosing all protected views.
 */
export function AppLayout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);

  // Poll server for unread notification count to show on the navigation item badge
  const { data: unreadData } = useUnreadCount();
  const unreadCount = unreadData?.unread_count ?? 0;

  // Determine active state for navigation links with query parameters
  const searchParams = new URLSearchParams(location.search);
  const isAssignedToMeActive =
    location.pathname === "/work-items" &&
    Boolean(user?.id && searchParams.get("assignee_id") === String(user.id));
  const isWorkItemsActive =
    location.pathname === "/work-items" && !isAssignedToMeActive;

  /**
   * Handle user logout by notifying the backend to invalidate the session cookie
   * and clearing local state in Zustand before redirecting to the login page.
   */
  async function onLogout() {
    try {
      await api.post("/auth/logout");
    } catch {
      // Even if network or server fails, client-side logout state must still proceed
    }
    logout();
    navigate("/login");
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      {/* Sidebar Navigation */}
      <aside className="border-b border-border bg-white p-4 lg:border-b-0 lg:border-r">
        <div className="mb-6 text-lg font-semibold tracking-tight text-slate-900">Newtonite</div>
        <nav className="flex gap-1 lg:flex-col">
          {/* Main Dashboard */}
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive ? "bg-muted text-slate-900 font-semibold" : "text-slate-600 hover:bg-muted hover:text-slate-900"
              }`
            }
          >
            Dashboard
          </NavLink>

          {/* All Work Items */}
          <NavLink
            to="/work-items"
            end
            className={() =>
              `rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isWorkItemsActive ? "bg-muted text-slate-900 font-semibold" : "text-slate-600 hover:bg-muted hover:text-slate-900"
              }`
            }
          >
            Work items
          </NavLink>

          {/* Assigned To Me (scoped to authenticated user's ID) */}
          {user && (
            <NavLink
              to={`/work-items?assignee_id=${user.id}`}
              className={() =>
                `rounded-md px-3 py-2 text-sm font-medium transition-colors flex items-center justify-between ${
                  isAssignedToMeActive ? "bg-muted text-slate-900 font-semibold" : "text-slate-600 hover:bg-muted hover:text-slate-900"
                }`
              }
            >
              <span>Assigned to me</span>
            </NavLink>
          )}

          {/* User Profile */}
          <NavLink
            to="/profile"
            className={({ isActive }) =>
              `rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive ? "bg-muted text-slate-900 font-semibold" : "text-slate-600 hover:bg-muted hover:text-slate-900"
              }`
            }
          >
            Profile
          </NavLink>

          {/* Notification Inbox with badge counter */}
          <NavLink
            to="/notifications"
            className={({ isActive }) =>
              `rounded-md px-3 py-2 text-sm font-medium transition-colors flex items-center justify-between ${
                isActive ? "bg-muted text-slate-900 font-semibold" : "text-slate-600 hover:bg-muted hover:text-slate-900"
              }`
            }
          >
            <span>Notifications</span>
            {unreadCount > 0 && (
              <span className="rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold text-white leading-none">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </NavLink>

          {/* Administrative Sections (Visible only to Admin users) */}
          {user?.is_admin && (
            <>
              <div className="my-2 border-t border-border" />
              <div className="px-3 py-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Administration
              </div>
              <NavLink
                to="/admin/users"
                className={({ isActive }) =>
                  `rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    isActive ? "bg-muted text-slate-900 font-semibold" : "text-slate-600 hover:bg-muted hover:text-slate-900"
                  }`
                }
              >
                User Verification
              </NavLink>
              <NavLink
                to="/admin/employees"
                className={({ isActive }) =>
                  `rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    isActive ? "bg-muted text-slate-900 font-semibold" : "text-slate-600 hover:bg-muted hover:text-slate-900"
                  }`
                }
              >
                Employee Management
              </NavLink>
            </>
          )}
        </nav>
      </aside>

      {/* Main Content Area */}
      <div>
        <header className="flex items-center justify-between border-b border-border bg-white px-4 py-3">
          <div className="text-sm text-slate-500">Operational work coordination</div>
          <div className="flex items-center gap-3 text-sm">
            {/* Header Notification Popover Bell */}
            <NotificationBell />
            <span className="font-medium text-slate-700">
              {user?.name} {user?.is_admin ? "(Admin)" : ""}
            </span>
            <Button variant="secondary" onClick={() => setShowLogoutDialog(true)}>
              Logout
            </Button>
          </div>
        </header>
        <main className="p-4 lg:p-6">
          <Outlet />
        </main>
      </div>

      {/* Modal Dialog for Logout Confirmation */}
      <Dialog open={showLogoutDialog} onClose={() => setShowLogoutDialog(false)} title="Confirm Logout">
        <p className="text-slate-600 mb-6">Are you sure you want to log out?</p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setShowLogoutDialog(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onLogout}>
            Confirm Logout
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
