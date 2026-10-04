/**
 * Root Application Component
 *
 * Configures the React Router SPA navigation hierarchy:
 *  - `/login`: Public login and registration portal.
 *  - Protected Routes: Wrapped with `ProtectedRoute` guard and `AppLayout` shell:
 *      - `/`: Real-time operational metrics dashboard.
 *      - `/work-items`: Filterable and paginated work items list.
 *      - `/work-items/new`: Create work item form with idempotency key generation.
 *      - `/work-items/:id`: Work item detail, OCC version-gated editor, transitions, and comments.
 *      - `/admin/users`: Pending employee registration approval interface.
 *      - `/admin/employees`: Employee team assignments and role management.
 *      - `/profile`: User personal settings.
 *      - `/notifications`: Full notifications management view.
 *
 * Handles cross-tab synchronization via `window.addEventListener('storage')`:
 * when `newtonite_is_logged_in` is removed by any other tab, all open tabs immediately log out.
 */

import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "@/layouts/AppLayout";
import { ProtectedRoute } from "@/routes/ProtectedRoute";
import {
  AdminEmployeeManagementPage,
  AdminUsersPage,
  DashboardPage,
  LoginPage,
  NewWorkItemPage,
  NotificationsPage,
  ProfilePage,
  WorkItemDetailPage,
  WorkItemListPage,
} from "@/pages";
import { useAuthStore } from "@/store/auth";

export default function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const logout = useAuthStore((s) => s.logout);

  /**
   * Cross-Tab Synchronization Listener
   *
   * Note on HTTP-only Cookies vs. localStorage:
   * - Authentication credentials (JWT) are stored and transported strictly inside secure,
   *   HTTP-only cookies (`access_token`), ensuring client scripts cannot access sensitive tokens (XSS mitigation).
   * - However, client-side JavaScript cannot observe changes to HTTP-only cookies directly, meaning
   *   logging out in one tab cannot natively signal other open tabs via cookie events.
   * - To solve this, a non-sensitive sentinel flag (`localStorage.newtonite_is_logged_in`) is used solely
   *   as an event signaling mechanism. When a user logs out in any tab, removing this key triggers the
   *   browser's native `window.addEventListener("storage", ...)` event in all other open tabs of the same
   *   origin, immediately synchronizing the logged-out state across the entire browser session.
   */
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "newtonite_is_logged_in" && !e.newValue) {
        logout();
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [logout]);

  return (
    <Routes>
      <Route path="/login" element={isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/work-items" element={<WorkItemListPage />} />
          <Route path="/work-items/new" element={<NewWorkItemPage />} />
          <Route path="/work-items/:id" element={<WorkItemDetailPage />} />
          <Route path="/admin/users" element={<AdminUsersPage />} />
          <Route path="/admin/employees" element={<AdminEmployeeManagementPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
        </Route>
      </Route>
    </Routes>
  );
}

