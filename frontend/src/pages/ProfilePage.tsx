/**
 * ProfilePage Component
 *
 * User profile overview and settings management view.
 *
 * Capabilities:
 * - Displays authenticated operator details: name, email, system role badges (Admin, Team Lead),
 *   and current team affiliations.
 * - Profile Editing: Allows updating name, email address, and team membership selections.
 * - Cache Synchronization:
 *   - Issues PUT `/auth/me` mutation.
 *   - On success, synchronizes the Zustand auth store (`setUser`), updates the active React Query
 *     query cache entry (`["me"]`), and invalidates affected queries (`["users"]`, `["teams"]`).
 */

import { useState, useEffect } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuthStore } from "@/store/auth";
import { useMe, useTeams } from "@/hooks/use-api";
import { api, ApiRequestError } from "@/api/client";
import type { User } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Spinner, ErrorState } from "@/components/ui/states";

/**
 * User profile view and update settings interface.
 */
export function ProfilePage() {
  const queryClient = useQueryClient();
  const authStoreUser = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  const meQuery = useMe();
  const teamsQuery = useTeams();
  const user = meQuery.data || authStoreUser;

  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [selectedTeamIds, setSelectedTeamIds] = useState<number[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const allTeams = teamsQuery.data || [];

  const getUserTeamIds = (u: User): number[] => {
    if (u.memberships && u.memberships.length > 0) {
      return u.memberships.map((m) => m.team_id);
    }
    if (u.team_ids && u.team_ids.length > 0) {
      return u.team_ids;
    }
    return [];
  };

  useEffect(() => {
    if (user) {
      setName(user.name || "");
      setEmail(user.email || "");
      setSelectedTeamIds(getUserTeamIds(user));
    }
  }, [user]);

  const updateMutation = useMutation({
    mutationFn: (payload: { name: string; email: string; team_ids: number[] }) =>
      api.put<User>("/auth/me", payload),
    onSuccess: (updatedUser) => {
      setUser(updatedUser);
      queryClient.setQueryData(["me"], updatedUser);
      queryClient.invalidateQueries({ queryKey: ["me"] });
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["teams"] });
      toast.success("Profile updated successfully");
      setIsEditing(false);
      setErrorMessage(null);
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof ApiRequestError || err instanceof Error
          ? err.message
          : "Failed to update profile";
      setErrorMessage(msg);
      toast.error(msg);
    },
  });

  const handleStartEdit = () => {
    if (user) {
      setName(user.name);
      setEmail(user.email);
      setSelectedTeamIds(getUserTeamIds(user));
    }
    setErrorMessage(null);
    setIsEditing(true);
  };

  const handleCancel = () => {
    if (user) {
      setName(user.name);
      setEmail(user.email);
      setSelectedTeamIds(getUserTeamIds(user));
    }
    setErrorMessage(null);
    setIsEditing(false);
  };

  const toggleTeam = (teamId: number) => {
    setSelectedTeamIds((prev) =>
      prev.includes(teamId)
        ? prev.filter((id) => id !== teamId)
        : [...prev, teamId]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName) {
      setErrorMessage("Name is required");
      return;
    }
    if (!trimmedEmail) {
      setErrorMessage("Email is required");
      return;
    }

    setErrorMessage(null);
    updateMutation.mutate({
      name: trimmedName,
      email: trimmedEmail,
      team_ids: selectedTeamIds,
    });
  };

  if (meQuery.isLoading && !user) {
    return <Spinner />;
  }

  if (meQuery.isError && !user) {
    return (
      <ErrorState
        message={
          meQuery.error instanceof Error
            ? meQuery.error.message
            : "Failed to load profile"
        }
      />
    );
  }

  if (!user) return null;

  // Resolve user teams from memberships and team_ids
  const userTeamIds = getUserTeamIds(user);
  const matchedTeams = allTeams.filter((t) => userTeamIds.includes(t.id));
  const fallbackMembershipNames = (user.memberships || [])
    .map((m) => m.team?.name)
    .filter(Boolean) as string[];

  const teamNamesToDisplay =
    matchedTeams.length > 0
      ? matchedTeams.map((t) => t.name)
      : fallbackMembershipNames;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Profile</h1>
        {!isEditing && (
          <Button variant="primary" onClick={handleStartEdit}>
            Update Information
          </Button>
        )}
      </div>

      {errorMessage && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          {errorMessage}
        </div>
      )}

      <div className="rounded border border-border bg-white p-6">
        {isEditing ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-slate-700">
                Name
              </label>
              <Input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1"
                required
                autoFocus
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700">
                Email
              </label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Teams
              </label>
              {teamsQuery.isLoading ? (
                <p className="text-xs text-slate-400">Loading teams...</p>
              ) : allTeams.length === 0 ? (
                <p className="text-xs text-slate-400">No teams available</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {allTeams.map((team) => {
                    const isChecked = selectedTeamIds.includes(team.id);
                    return (
                      <label
                        key={team.id}
                        className={`flex items-center gap-2.5 p-2.5 rounded border text-sm cursor-pointer transition-colors ${
                          isChecked
                            ? "border-blue-500 bg-blue-50/60 text-slate-900 font-medium"
                            : "border-border bg-white text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleTeam(team.id)}
                          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span>{team.name}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <span className="block text-sm font-medium text-slate-700">Role</span>
              <div className="mt-1">
                <Badge value={user.is_admin ? "Admin" : "Member"} />
              </div>
            </div>

            <div>
              <span className="block text-sm font-medium text-slate-700">Joined</span>
              <p className="mt-1 text-sm text-slate-600">
                {new Date(user.created_at).toLocaleDateString()}
              </p>
            </div>

            <div className="flex items-center gap-3 pt-3 border-t border-border">
              <Button
                type="submit"
                variant="primary"
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={handleCancel}
                disabled={updateMutation.isPending}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <div className="divide-y divide-border text-sm">
            <div className="grid grid-cols-3 py-3 first:pt-0">
              <span className="font-medium text-slate-700">Name</span>
              <span className="col-span-2 text-slate-900">{user.name}</span>
            </div>
            <div className="grid grid-cols-3 py-3">
              <span className="font-medium text-slate-700">Email</span>
              <span className="col-span-2 text-slate-900">{user.email}</span>
            </div>
            <div className="grid grid-cols-3 py-3">
              <span className="font-medium text-slate-700">Role</span>
              <span className="col-span-2">
                <Badge value={user.is_admin ? "Admin" : "Member"} />
              </span>
            </div>
            <div className="grid grid-cols-3 py-3">
              <span className="font-medium text-slate-700">Joined</span>
              <span className="col-span-2 text-slate-900">
                {new Date(user.created_at).toLocaleDateString()}
              </span>
            </div>
            <div className="grid grid-cols-3 py-3 last:pb-0">
              <span className="font-medium text-slate-700">Teams</span>
              <span className="col-span-2">
                {teamNamesToDisplay.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {teamNamesToDisplay.map((teamName, idx) => (
                      <span
                        key={idx}
                        className="rounded bg-slate-200 px-2 py-0.5 text-xs text-slate-700"
                      >
                        {teamName}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-slate-400">No teams</span>
                )}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
