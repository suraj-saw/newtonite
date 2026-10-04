/**
 * AdminEmployeeManagementPage Component
 *
 * Administrative user roster for auditing employee roles, team assignments, and organizational status.
 *
 * Capabilities:
 * - Restricted exclusively to administrators (`is_admin === true`).
 * - Displays all users, their privilege tiers (Admin, Team Lead, Member), registered dates,
 *   and current team memberships with Team Lead designation badges.
 * - Allows removal/offboarding of employee accounts (`DELETE /users/{id}`), invalidating their
 *   session and unassigning orphaned work items in accordance with database cascades.
 */

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/api/client";
import { useUsers } from "@/hooks/use-api";
import { Spinner, ErrorState } from "@/components/ui/states";

/**
 * Computes human-readable role labels and Tailwind CSS pill badges for a user.
 *
 * @param user - User object containing `is_admin` and `memberships` array.
 * @returns Object with badge label and CSS className.
 */
function getUserRole(user: any): { label: string; className: string } {
  if (user.is_admin) {
    return {
      label: "Admin",
      className: "bg-purple-100 text-purple-800 font-semibold",
    };
  }
  const isLead = user.memberships?.some((m: any) => m.role === "TEAM_LEAD");
  if (isLead) {
    return {
      label: "Team Lead",
      className: "bg-blue-100 text-blue-800 font-semibold",
    };
  }
  return {
    label: "Member",
    className: "bg-slate-100 text-slate-700",
  };
}

/**
 * Management table for auditing and administering all platform users.
 */
export function AdminEmployeeManagementPage() {
  const queryClient = useQueryClient();
  const usersQuery = useUsers();
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  /**
   * Prompts confirmation and removes an employee account via the backend.
   *
   * @param id - The numeric user identifier to delete.
   */
  const handleRemoveUser = async (id: number) => {
    if (confirm("Are you sure you want to remove this employee?")) {
      setSelectedUserId(id);
      setIsDeleting(true);
      try {
        await api.delete(`/users/${id}`);
        toast.success("Employee removed successfully");
        queryClient.invalidateQueries({ queryKey: ["users"] });
      } catch (err: any) {
        toast.error(err.message || "Failed to remove employee");
      } finally {
        setIsDeleting(false);
        setSelectedUserId(null);
      }
    }
  };

  if (usersQuery.isLoading) return <Spinner />;
  if (usersQuery.isError) {
    return <ErrorState message={usersQuery.error instanceof Error ? usersQuery.error.message : "Failed to load users"} />;
  }

  const users = usersQuery.data || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Employee Management</h1>
        <p className="text-sm text-slate-500">Manage employee accounts, organizational roles, and team assignments.</p>
      </div>

      {users.length === 0 ? (
        <p className="text-slate-500">No employees found.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="p-3 font-medium text-slate-700">Name</th>
                <th className="p-3 font-medium text-slate-700">Email</th>
                <th className="p-3 font-medium text-slate-700">Role</th>
                <th className="p-3 font-medium text-slate-700">Joined</th>
                <th className="p-3 font-medium text-slate-700">Teams</th>
                <th className="p-3 font-medium text-slate-700 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map((user: any) => {
                const role = getUserRole(user);
                return (
                  <tr key={user.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3 font-medium text-slate-900">{user.name}</td>
                    <td className="p-3 text-slate-600">{user.email}</td>
                    <td className="p-3">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs ${role.className}`}>
                        {role.label}
                      </span>
                    </td>
                    <td className="p-3 text-slate-600">{new Date(user.created_at).toLocaleDateString()}</td>
                    <td className="p-3">
                      {user.memberships && user.memberships.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {user.memberships.map((m: any) => (
                            <span
                              key={m.id}
                              className={`rounded px-2 py-0.5 text-xs ${
                                m.role === "TEAM_LEAD"
                                  ? "bg-blue-50 text-blue-700 border border-blue-200 font-medium"
                                  : "bg-slate-100 text-slate-700"
                              }`}
                            >
                              {m.team?.name || "Unknown"}
                              {m.role === "TEAM_LEAD" ? " (Lead)" : ""}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-400 text-xs">No teams</span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <button
                          className="text-red-600 hover:underline text-sm font-medium disabled:opacity-50"
                          onClick={() => handleRemoveUser(user.id)}
                          disabled={isDeleting && selectedUserId === user.id}
                        >
                          {isDeleting && selectedUserId === user.id ? "Removing..." : "Remove"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default AdminEmployeeManagementPage;
