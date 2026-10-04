/**
 * AdminUsersPage Component
 *
 * Administrative dashboard for reviewing and approving newly registered user accounts.
 *
 * Access Scoping & Workflow:
 * - Restricted exclusively to administrators (`is_admin === true`).
 * - Queries the `/users/pending` endpoint to retrieve unapproved registrations.
 * - Allows administrators to verify employee identities before granting access to operational workflows:
 *   - "Approve": Issues a POST `/users/{id}/approve` request, granting full platform access and sending
 *     an in-app notification to the approved user.
 *   - "Reject": Issues a POST `/users/{id}/reject` request, rejecting the registration and notifying the user.
 * - Automatically updates the local user table upon decision.
 */

import { useEffect, useState } from "react";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import type { User } from "@/types";

/**
 * Admin view for managing pending user registration approvals.
 */
export function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  /**
   * Fetch pending unapproved user registrations from the server.
   */
  const loadPendingUsers = async () => {
    try {
      const res = await api.get<User[]>("/users/pending");
      setUsers(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load users";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPendingUsers();
  }, []);

  /**
   * Approve a pending user account, enabling login and platform interaction.
   */
  const handleApprove = async (id: number) => {
    try {
      await api.post(`/users/${id}/approve`);
      setUsers(users.filter(u => u.id !== id));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to approve user";
      alert(msg);
    }
  };

  /**
   * Reject a pending user registration request.
   */
  const handleReject = async (id: number) => {
    try {
      await api.post(`/users/${id}/reject`);
      setUsers(users.filter(u => u.id !== id));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to reject user";
      alert(msg);
    }
  };

  if (loading) return <div className="p-8 text-center text-sm text-slate-500">Loading pending users...</div>;
  if (error) return <div className="p-4 text-sm text-red-500 bg-red-50 rounded-lg">{error}</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Pending Users Verification</h1>
        <p className="text-sm text-slate-500">Review and authorize new employee registration requests.</p>
      </div>

      {users.length === 0 ? (
        <div className="rounded-lg border border-border bg-white p-8 text-center text-slate-500">
          No pending users found. All registration requests have been resolved.
        </div>
      ) : (
        <div className="overflow-x-auto rounded border border-border bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="p-3 font-medium text-slate-700">Name</th>
                <th className="p-3 font-medium text-slate-700">Email</th>
                <th className="p-3 font-medium text-slate-700">Registered</th>
                <th className="p-3 font-medium text-slate-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-3 font-medium text-slate-900">{user.name}</td>
                  <td className="p-3 text-slate-600">{user.email}</td>
                  <td className="p-3 text-slate-600">{new Date(user.created_at).toLocaleDateString()}</td>
                  <td className="p-3">
                    <div className="flex gap-2">
                      <Button variant="primary" onClick={() => handleApprove(user.id)}>
                        Approve
                      </Button>
                      <Button variant="danger" onClick={() => handleReject(user.id)}>
                        Reject
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
