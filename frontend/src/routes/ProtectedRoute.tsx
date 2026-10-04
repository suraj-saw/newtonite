/**
 * ProtectedRoute Component
 *
 * Route guard component that restricts access to authenticated users only.
 *
 * Architecture & Security Mechanics:
 * - Checks client-side auth status flag (`isAuthenticated`) from Zustand store.
 * - If authenticated, verifies session validity by fetching the current user (`/auth/me`) via React Query.
 * - If the backend rejects the session (e.g. 401 Unauthorized due to expired token or invalidated session version),
 *   it triggers a clean client-side logout and redirects the user to `/login`.
 * - Renders a loading spinner during session validation to prevent UI flicker or unauthorized view flashes.
 * - Uses React Router's `<Outlet />` to render child routes when authenticated.
 */

import { Navigate, Outlet } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { useAuthStore } from "@/store/auth";
import type { User } from "@/types";
import { Spinner } from "@/components/ui/states";

/**
 * Route guard wrapper rendering child routes for authenticated sessions
 * or redirecting unauthenticated / invalid sessions to the login page.
 */
export function ProtectedRoute() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const setUser = useAuthStore((s) => s.setUser);
  const logout = useAuthStore((s) => s.logout);

  // Validate the current authentication cookie / session with the backend.
  // Disabled if local auth store already knows the user is unauthenticated.
  const me = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const user = await api.get<User>("/auth/me");
      setUser(user);
      return user;
    },
    enabled: isAuthenticated,
    retry: false,
  });

  // Fast-path: local state indicates not logged in
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  // Display centered loader while verifying JWT / session status
  if (me.isLoading) return <div className="p-8"><Spinner /></div>;

  // If server returns error (e.g., token expired or session_version revoked), reset state and redirect
  if (me.isError) {
    logout();
    return <Navigate to="/login" replace />;
  }

  // Session verified; render nested route hierarchy
  return <Outlet />;
}
