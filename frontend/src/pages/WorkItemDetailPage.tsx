/**
 * WorkItemDetailPage Component
 *
 * Detailed operational workspace for inspecting and mutating a single work item.
 *
 * Key System Capabilities & Architectural Patterns:
 * 1. Optimistic Concurrency Control (OCC):
 *    - Mutations send the local `version` number in the payload.
 *    - The backend rejects requests if the database version has advanced (409 STALE_VERSION).
 *    - Detects background server updates via polling (8s refetch interval) and displays a sticky
 *      warning banner when `server.version > local.version`, offering a one-click re-sync.
 * 2. Finite State Machine (FSM):
 *    - Adheres to predefined lifecycle transitions (OPEN -> IN_PROGRESS -> PENDING_APPROVAL -> RESOLVED -> CLOSED).
 *    - Context-sensitive actions (e.g. prompt for blocker reason when transitioning to BLOCKED).
 * 3. Role-Based Access Scoping:
 *    - Reassignment and status changes are guarded by team membership and Team Lead/Admin privileges.
 *    - Displays inline contextual error banners when unauthorized reassignments or edits are attempted.
 * 4. Audit Trail & Discussion Thread:
 *    - Immutable Activity Log displaying all historical status changes, reassignments, and blocker updates.
 *    - Discussion / Comment feed for operational handoff and team coordination.
 */

import { useState, useEffect, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, ApiRequestError } from "@/api/client";
import { useActivity, useComments, useTeams, useTeamDetail, useWorkItem } from "@/hooks/use-api";
import { useAuthStore } from "@/store/auth";
import type { WorkItem } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, ErrorState, Spinner } from "@/components/ui/states";
import { formatDate, isOverdue } from "@/lib/utils";

/**
 * Client-side mirror of valid workflow transitions.
 * Guides UI button availability and prevents invalid transition requests.
 */
const TRANSITIONS: Record<string, string[]> = {
  OPEN: ["IN_PROGRESS", "PENDING_APPROVAL", "CLOSED"],
  IN_PROGRESS: ["PENDING_APPROVAL", "BLOCKED", "RESOLVED"],
  PENDING_APPROVAL: ["IN_PROGRESS", "RESOLVED", "OPEN"],
  BLOCKED: ["IN_PROGRESS", "PENDING_APPROVAL"],
  RESOLVED: ["CLOSED", "IN_PROGRESS"],
  CLOSED: [],
};

/**
 * Standardized mutation error handler displaying specialized toast feedback
 * for concurrency collisions (409 STALE_VERSION) and permission denials (403).
 */
function handleMutationError(err: unknown) {
  if (err instanceof ApiRequestError && err.status === 409 && err.code === "STALE_VERSION") {
    toast.error(
      "Another team member has just updated or claimed this work item. The page has been refreshed with the latest data.",
      { duration: 5000 },
    );
    return;
  }
  if (err instanceof ApiRequestError && err.status === 403) {
    toast.error(err.message, { duration: 6000 });
    return;
  }
  toast.error(err instanceof Error ? err.message : "Request failed");
}

/**
 * Page component rendering the work item overview, status actions, assignee selector,
 * blocker management, edit dialog, comment stream, and audit activity history.
 */
export function WorkItemDetailPage() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  // Poll every 8 seconds in the background and revalidate on window focus
  const itemQuery = useWorkItem(id, { refetchInterval: 8000 });
  const [displayedItem, setDisplayedItem] = useState<WorkItem | null>(null);

  const comments = useComments(id);
  const activity = useActivity(id);
  const teams = useTeams();
  const teamDetail = useTeamDetail(displayedItem?.team_id || itemQuery.data?.team_id);

  const [editOpen, setEditOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [isAssigning, setIsAssigning] = useState(false);

  // Blocker & What Requires Attention Next dialog
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [blockedReasonInput, setBlockedReasonInput] = useState("");

  // Role & Permission error feedback
  const [reassignPermissionError, setReassignPermissionError] = useState<string | null>(null);
  const [editPermissionError, setEditPermissionError] = useState<string | null>(null);

  // Sync displayedItem on initial load or after refresh
  useEffect(() => {
    if (itemQuery.data && !displayedItem) {
      setDisplayedItem(itemQuery.data);
    }
  }, [itemQuery.data, displayedItem]);

  const item = displayedItem || itemQuery.data;

  // Stale detection: the server has a newer version than what is currently rendered
  const isStale = Boolean(
    itemQuery.data && displayedItem && itemQuery.data.version > displayedItem.version,
  );
  const serverVersion = itemQuery.data?.version;
  const localVersion = displayedItem?.version;

  const isAssignedToMe = Boolean(user && item && item.assignee_id === user.id);
  const isLead = Boolean(
    user?.is_admin || (item && user?.lead_team_ids && user.lead_team_ids.includes(item.team_id)),
  );

  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: ["work-item", id] });
    await queryClient.invalidateQueries({ queryKey: ["activity", id] });
    await queryClient.invalidateQueries({ queryKey: ["comments", id] });
    await queryClient.invalidateQueries({ queryKey: ["work-items"] });
    await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  }

  async function transition(status: string, blockedReason?: string) {
    if (!item) return;
    try {
      const updated = await api.post<WorkItem>(`/work-items/${item.id}/transition`, {
        version: item.version,
        status,
        ...(status === "BLOCKED" ? { blocked_reason: blockedReason || null } : {}),
      });
      setDisplayedItem(updated);
      if (status === "BLOCKED") {
        toast.success("Work item marked as BLOCKED");
      } else if (status === "PENDING_APPROVAL") {
        toast.success("Submitted for approval (PENDING APPROVAL)");
      } else if (item.status === "PENDING_APPROVAL") {
        toast.success(`Item approved and transitioned to ${status.replaceAll("_", " ")}`);
      } else {
        toast.success(`Status updated to ${status.replaceAll("_", " ")}`);
      }
      setBlockDialogOpen(false);
      await invalidate();
    } catch (err) {
      handleMutationError(err);
      if (itemQuery.data) setDisplayedItem(itemQuery.data);
      await invalidate();
    }
  }

  async function updateBlockerReason(reason: string) {
    if (!item) return;
    try {
      const updated = await api.patch<WorkItem>(`/work-items/${item.id}`, {
        version: item.version,
        blocked_reason: reason,
      });
      setDisplayedItem(updated);
      toast.success("Blocker details updated");
      setBlockDialogOpen(false);
      await invalidate();
    } catch (err) {
      handleMutationError(err);
      if (itemQuery.data) setDisplayedItem(itemQuery.data);
      await invalidate();
    }
  }

  async function assign(assigneeId: string) {
    if (!item || isAssigning) return;
    setIsAssigning(true);
    try {
      const updated = await api.post<WorkItem>(`/work-items/${item.id}/assign`, {
        version: item.version,
        assignee_id: assigneeId ? Number(assigneeId) : null,
      });

      setDisplayedItem(updated);
      if (assigneeId === String(user?.id)) {
        toast.success("You have taken responsibility for this work item");
      } else if (!assigneeId) {
        toast.success("Work item unassigned / released");
      } else {
        toast.success("Assignment updated");
      }
      await invalidate();
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 403) {
        setReassignPermissionError(err.message);
        toast.error(err.message, { duration: 6000 });
      } else if (err instanceof ApiRequestError && err.status === 409 && err.code === "STALE_VERSION") {
        toast.error(
          "Another team member has just claimed or modified this item. Refreshing with the latest data...",
          { duration: 5000 },
        );
      } else {
        handleMutationError(err);
      }
      if (itemQuery.data) setDisplayedItem(itemQuery.data);
      await invalidate();
    } finally {
      setIsAssigning(false);
    }
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!item) return;
    const form = new FormData(event.currentTarget);
    try {
      const updated = await api.patch<WorkItem>(`/work-items/${item.id}`, {
        version: item.version,
        title: String(form.get("title")),
        description: String(form.get("description")),
        priority: String(form.get("priority")),
        team_id: Number(form.get("team_id")),
        due_at: form.get("due_at") ? new Date(String(form.get("due_at"))).toISOString() : null,
      });
      setDisplayedItem(updated);
      setEditPermissionError(null);
      toast.success("Work item updated");
      setEditOpen(false);
      await invalidate();
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 403) {
        setEditPermissionError(err.message);
        toast.error(err.message, { duration: 6000 });
      } else {
        handleMutationError(err);
      }
      if (itemQuery.data) setDisplayedItem(itemQuery.data);
      await invalidate();
    }
  }

  async function addComment(event: FormEvent) {
    event.preventDefault();
    if (!item || !comment.trim()) return;
    try {
      await api.post(`/work-items/${item.id}/comments`, { body: comment });
      setComment("");
      await invalidate();
    } catch (err) {
      handleMutationError(err);
    }
  }

  if (itemQuery.isLoading && !item) return <Spinner />;
  if (itemQuery.isError && !item) {
    return <ErrorState message={itemQuery.error instanceof Error ? itemQuery.error.message : "Failed to load"} />;
  }
  if (!item) return <EmptyState title="Work item not found" />;

  const overdue = isOverdue(item.due_at, item.status);
  const dueLocal = item.due_at ? new Date(item.due_at).toISOString().slice(0, 16) : "";

  return (
    <div className="space-y-4">
      {/* Concurrent Update / Stale Data Alert Bar */}
      {isStale && (
        <div className="sticky top-2 z-20 flex flex-wrap items-center justify-between gap-3 rounded-lg border-2 border-amber-400 bg-amber-50 p-3.5 shadow-md animate-in slide-in-from-top-2">
          <div className="flex items-center gap-2.5">
            <span className="flex h-3 w-3 shrink-0 rounded-full bg-amber-500 animate-ping" />
            <span className="text-sm font-semibold text-amber-950">
              ⚠️ A teammate updated this item (v{localVersion} &rarr; v{serverVersion}).
            </span>
            <span className="text-xs text-amber-800 hidden sm:inline">
              Your view is showing an earlier version.
            </span>
          </div>
          <Button
            className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shadow-sm"
            onClick={() => {
              if (itemQuery.data) {
                setDisplayedItem(itemQuery.data);
                queryClient.invalidateQueries({ queryKey: ["activity", id] });
                queryClient.invalidateQueries({ queryKey: ["comments", id] });
                toast.success("Updated to latest version");
              }
            }}
          >
            Refresh to see latest version &rarr;
          </Button>
        </div>
      )}

      {/* Header Card */}
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm font-mono text-slate-500">#{item.id}</div>
            <h1 className="text-2xl font-semibold text-slate-900">{item.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge value={item.status} />
              <Badge value={item.priority} />
              <span className="text-sm text-slate-600 font-medium">{item.team_name}</span>

              {isAssignedToMe ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
                  Assigned to you
                  <button
                    type="button"
                    disabled={isAssigning}
                    onClick={() => assign("")}
                    className="ml-1 text-slate-500 hover:text-red-700 underline text-[11px]"
                    title="Release assignment"
                  >
                    Release
                  </button>
                </span>
              ) : item.assignee_id ? (
                <span className="text-sm text-slate-600">
                  Assignee: <strong className="text-slate-800">{item.assignee_name}</strong>
                </span>
              ) : (
                <button
                  type="button"
                  disabled={isAssigning}
                  onClick={() => user && assign(String(user.id))}
                  className="inline-flex items-center gap-1 rounded-full bg-amber-100 hover:bg-amber-200 px-2.5 py-0.5 text-xs font-semibold text-amber-800 transition-colors"
                >
                  <span>Unassigned</span>
                  <span className="font-normal underline">· Claim item</span>
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={async () => {
                const res = await itemQuery.refetch();
                if (res.data) {
                  setDisplayedItem(res.data);
                }
                await queryClient.invalidateQueries({ queryKey: ["activity", id] });
                await queryClient.invalidateQueries({ queryKey: ["comments", id] });
                toast.success("Refreshed latest data");
              }}
              disabled={itemQuery.isFetching}
              title="Check for updates from server"
            >
              {itemQuery.isFetching ? (
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-500 border-t-transparent" />
                  Syncing...
                </span>
              ) : (
                <span>🔄 Refresh</span>
              )}
            </Button>
            <Button onClick={() => setEditOpen(true)}>Edit</Button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {overdue ? <span className="rounded bg-red-100 px-2 py-1 text-red-800 font-medium">Overdue</span> : null}
          {item.status === "BLOCKED" ? (
            <span className="rounded bg-amber-100 px-2 py-1 text-amber-800 font-medium">Blocked</span>
          ) : null}
          {!item.assignee_id ? (
            <span className="rounded bg-slate-100 px-2 py-1 text-slate-700">Unassigned</span>
          ) : null}
          {Date.now() - new Date(item.updated_at).getTime() < 24 * 3600 * 1000 ? (
            <span className="rounded bg-indigo-100 px-2 py-1 text-indigo-800">Recently modified</span>
          ) : null}
        </div>
      </Card>

      {/* Prominent Next Action Needed / Blocker Banner */}
      {item.status === "BLOCKED" && (
        <div className="rounded-lg border-2 border-amber-300 bg-amber-50/90 p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-200 text-amber-900 font-bold text-base">
                ⚠️
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-900">
                    Work Item Blocked
                  </span>
                  <span className="rounded bg-amber-200/90 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                    Attention Required Next
                  </span>
                </div>
                <p className="mt-1.5 text-sm font-semibold text-amber-950">
                  {item.blocked_reason || "Blocked: Waiting for external resolution or teammate action."}
                </p>
                <p className="mt-1 text-xs text-amber-800">
                  This work item is on hold. Address the blocker above, then click <strong>Unblock & Resume</strong> to continue.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                className="border border-amber-300 bg-white text-xs font-medium text-amber-900 hover:bg-amber-100"
                onClick={() => {
                  setBlockedReasonInput(item.blocked_reason || "");
                  setBlockDialogOpen(true);
                }}
              >
                Edit Blocker Reason
              </Button>
              <Button
                className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shadow-sm"
                onClick={() => transition("IN_PROGRESS")}
              >
                Unblock & Resume &rarr;
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Prominent Pending Approval Banner */}
      {item.status === "PENDING_APPROVAL" && (
        <div className="rounded-lg border-2 border-purple-300 bg-purple-50/90 p-4 shadow-sm animate-in slide-in-from-top-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-purple-200 text-purple-900 font-bold text-base">
                ✍️
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-purple-900">
                    Pending Approval
                  </span>
                  <span className="rounded bg-purple-200/90 px-2 py-0.5 text-[11px] font-semibold text-purple-900">
                    Team Lead Sign-off Required
                  </span>
                </div>
                <p className="mt-1.5 text-sm font-semibold text-purple-950">
                  {item.type === "COMPLIANCE" || item.type === "OPERATIONAL"
                    ? `Operational / Compliance Review: This ${item.type.toLowerCase()} item is awaiting Team Lead review and sign-off.`
                    : "This work item has been submitted for approval before work can proceed."}
                </p>
                <p className="mt-1 text-xs text-purple-800">
                  {isLead
                    ? "As Team Lead, review the details, comments, and audit trail below, then approve or return the item."
                    : "Awaiting approval from a Team Lead. You will see the status update once reviewed."}
                </p>
              </div>
            </div>
            {isLead ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  className="border border-purple-300 bg-white text-xs font-medium text-purple-900 hover:bg-purple-100"
                  onClick={() => transition("OPEN")}
                >
                  ↩️ Return to Open
                </Button>
                <Button
                  className="bg-purple-700 hover:bg-purple-800 text-white text-xs font-semibold shadow-sm"
                  onClick={() => transition("IN_PROGRESS")}
                >
                  ✅ Approve to In Progress
                </Button>
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm"
                  onClick={() => transition("RESOLVED")}
                >
                  ✅ Approve & Resolve
                </Button>
              </div>
            ) : (
              <div className="rounded bg-purple-100/70 border border-purple-200 px-3 py-1.5 text-xs text-purple-800 font-medium self-center">
                🔒 Approval restricted to Team Leads
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Content Grid */}
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        {/* Description & Details */}
        <Card>
          <h2 className="mb-2 font-medium text-slate-900">Description</h2>
          <p className="whitespace-pre-wrap text-sm text-slate-700">{item.description || "No description"}</p>
          <dl className="mt-4 grid gap-2 text-sm md:grid-cols-2">
            <div>
              <dt className="text-slate-500">Type</dt>
              <dd className="font-medium text-slate-800">{item.type.replaceAll("_", " ")}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Due</dt>
              <dd className={overdue ? "font-medium text-red-600" : "font-medium text-slate-800"}>
                {formatDate(item.due_at)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Created</dt>
              <dd className="text-slate-800">
                {formatDate(item.created_at)} by {item.created_by_name}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Version</dt>
              <dd className="font-mono text-slate-800">{item.version}</dd>
            </div>
            {item.status === "BLOCKED" && (
              <div className="md:col-span-2 rounded bg-amber-50/80 border border-amber-200 p-2.5">
                <dt className="text-xs font-bold text-amber-900 uppercase">Attention Required Next</dt>
                <dd className="mt-0.5 font-medium text-amber-900 text-sm">
                  {item.blocked_reason || "Not specified"}
                </dd>
              </div>
            )}
          </dl>
        </Card>

        {/* Actions & Ownership Card */}
        <Card className="space-y-4">
          <div>
            <h2 className="font-semibold text-slate-900">Workflow Actions</h2>

            {/* Note for Compliance & Operational items */}
            {(item.type === "COMPLIANCE" || item.type === "OPERATIONAL") &&
              (item.status === "OPEN" || item.status === "IN_PROGRESS") && (
                <div className="mt-2 rounded-md border border-purple-200 bg-purple-50/80 p-2 text-xs text-purple-950 flex items-center gap-2">
                  <span className="text-base">🛡️</span>
                  <span>
                    <strong>{item.type} Item:</strong> Requires sign-off. Click <em>Request Approval</em> when ready for review.
                  </span>
                </div>
              )}

            <div className="mt-2 flex flex-wrap gap-2">
              {item.status === "PENDING_APPROVAL" && !isLead ? (
                <div className="w-full rounded-md border border-purple-200 bg-purple-50 p-2.5 text-xs text-purple-900">
                  <span className="font-semibold">⏳ Awaiting Team Lead Approval</span>
                  <p className="mt-0.5 text-purple-700">Only Team Leads or Admins can approve or return items pending review.</p>
                </div>
              ) : (
                (TRANSITIONS[item.status] || []).map((status) => {
                  let label = `Move to ${status.replaceAll("_", " ")}`;
                  let extraClass = "";

                  if (status === "PENDING_APPROVAL") {
                    label = "✍️ Request Approval";
                    extraClass = "border-purple-300 text-purple-900 bg-purple-50 hover:bg-purple-100 font-medium";
                  } else if (item.status === "PENDING_APPROVAL") {
                    if (status === "IN_PROGRESS") {
                      label = "✅ Approve to In Progress";
                      extraClass = "bg-purple-700 hover:bg-purple-800 text-white font-medium";
                    } else if (status === "RESOLVED") {
                      label = "✅ Approve & Resolve";
                      extraClass = "bg-emerald-600 hover:bg-emerald-700 text-white font-medium";
                    } else if (status === "OPEN") {
                      label = "↩️ Return to Open";
                    }
                  }

                  return (
                    <Button
                      key={status}
                      variant="secondary"
                      className={extraClass}
                      onClick={() => {
                        if (status === "BLOCKED") {
                          setBlockedReasonInput(item.blocked_reason || "");
                          setBlockDialogOpen(true);
                        } else {
                          transition(status);
                        }
                      }}
                    >
                      {label}
                    </Button>
                  );
                })
              )}
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <h2 className="text-sm font-semibold text-slate-900 mb-2">Responsibility & Ownership</h2>

            {/* Quick Claim / Release Button */}
            {isAssignedToMe ? (
              <div className="space-y-2 rounded-lg bg-blue-50/70 border border-blue-200 p-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-blue-900">
                  <span className="h-2 w-2 rounded-full bg-blue-600 animate-pulse" />
                  You are currently responsible for this item
                </div>
                <Button
                  variant="secondary"
                  className="w-full text-xs text-slate-700 hover:text-red-700 hover:border-red-300"
                  disabled={isAssigning}
                  onClick={() => assign("")}
                >
                  {isAssigning ? "Releasing..." : "Release responsibility (Unassign)"}
                </Button>
              </div>
            ) : (
              <div className="space-y-2 rounded-lg bg-slate-50 border border-border p-3">
                <div className="text-xs text-slate-600">
                  {item.assignee_name ? (
                    <span>
                      Currently assigned to: <strong className="text-slate-900">{item.assignee_name}</strong>
                    </span>
                  ) : (
                    <span className="font-medium text-amber-700">Currently unassigned — requires an owner</span>
                  )}
                </div>
                <Button
                  className="w-full text-xs font-medium"
                  disabled={isAssigning}
                  onClick={() => user && assign(String(user.id))}
                >
                  {isAssigning ? (
                    "Claiming..."
                  ) : !item.assignee_id ? (
                    "🙋 Take responsibility (Assign to me)"
                  ) : (
                    "🙋 Reassign to me"
                  )}
                </Button>
              </div>
            )}

            {/* Reassign dropdown */}
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-700">
                  Reassign to team member:
                </label>
                <span className="inline-flex items-center gap-1 rounded bg-amber-50 border border-amber-200 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                  🛡️ Team Lead only
                </span>
              </div>
              <Select
                value={item.assignee_id ? String(item.assignee_id) : ""}
                onChange={(e) => {
                  setReassignPermissionError(null);
                  assign(e.target.value);
                }}
              >
                <option value="">Unassigned</option>
                {user && <option value={String(user.id)}>Assign to me ({user.name})</option>}
                <optgroup label="Team members">
                  {(teamDetail.data?.memberships || [])
                    .filter((m) => m.user)
                    .map((m) => (
                      <option key={m.user!.id} value={m.user!.id}>
                        {m.user!.name}
                      </option>
                    ))}
                </optgroup>
              </Select>
              {reassignPermissionError ? (
                <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900 font-medium animate-in fade-in">
                  ⛔ {reassignPermissionError}
                </div>
              ) : !isLead && !isAssignedToMe ? (
                <p className="mt-1 text-[11px] text-slate-400">
                  Reassigning items to other teammates is restricted to Team Leads.
                </p>
              ) : null}
            </div>
          </div>
        </Card>
      </div>

      {/* Comments & Activity Grid */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-medium text-slate-900">Comments</h2>
          <div className="space-y-3">
            {(comments.data || []).map((c) => (
              <div key={c.id} className="rounded-md bg-muted p-2.5 text-sm">
                <div className="text-xs text-slate-500 font-medium">
                  {c.author_name} · {formatDate(c.created_at)}
                </div>
                <div className="mt-1 text-slate-800">{c.body}</div>
              </div>
            ))}
            {(comments.data || []).length === 0 ? <EmptyState title="No comments yet" /> : null}
          </div>
          <form className="mt-3 space-y-2" onSubmit={addComment}>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              placeholder="Add a comment or update..."
            />
            <Button type="submit">Comment</Button>
          </form>
        </Card>

        <Card>
          <h2 className="mb-3 font-medium text-slate-900">Activity & Audit Trail</h2>
          <ol className="space-y-2.5 text-sm">
            {(activity.data || []).map((row) => (
              <li key={row.id} className="border-l-2 border-primary/30 pl-3">
                <div className="font-medium text-slate-800">
                  {row.action.replaceAll("_", " ")} · <span className="font-normal text-slate-600">{row.actor_name}</span>
                </div>
                <div className="text-xs text-slate-400">{formatDate(row.created_at)}</div>
                {row.field_name ? (
                  <div className="text-xs text-slate-600 mt-0.5">
                    <span className="font-mono">{row.field_name}</span>: {row.old_value || "—"} &rarr;{" "}
                    {row.new_value || "—"}
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        </Card>
      </div>

      {/* Blocker Reason / Attention Next Dialog */}
      <Dialog
        open={blockDialogOpen}
        title={item.status === "BLOCKED" ? "Update Blocker Reason / Next Action" : "Block Work Item — What Requires Attention Next?"}
        onClose={() => setBlockDialogOpen(false)}
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Specify what is holding up this work item and what requires attention next before work can resume
            (e.g., waiting for customer HAR capture, external vendor resolution, or compliance sign-off).
          </p>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-700">
              Blocker Reason / What Requires Attention Next
            </label>
            <Textarea
              value={blockedReasonInput}
              onChange={(e) => setBlockedReasonInput(e.target.value)}
              rows={3}
              placeholder="e.g. Waiting for customer to provide HAR capture from enterprise portal"
              className="w-full text-sm"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setBlockDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (item.status === "BLOCKED") {
                  updateBlockerReason(blockedReasonInput.trim());
                } else {
                  transition("BLOCKED", blockedReasonInput.trim());
                }
              }}
            >
              {item.status === "BLOCKED" ? "Save Changes" : "Confirm & Move to BLOCKED"}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog
        open={editOpen}
        title="Edit work item"
        onClose={() => {
          setEditOpen(false);
          setEditPermissionError(null);
        }}
      >
        <form className="space-y-3" onSubmit={saveEdit}>
          {isStale && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900 font-medium">
              ⚠️ Warning: A teammate updated this item on the server (v{localVersion} &rarr; v{serverVersion}). Saving will cause a version conflict. Close and refresh first.
            </div>
          )}
          {editPermissionError && (
            <div className="rounded-md border border-red-300 bg-red-50 p-2.5 text-xs text-red-900 font-medium animate-in fade-in">
              ⛔ Authorization Error: {editPermissionError}
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Title</label>
            <Input name="title" defaultValue={item.title} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
            <Textarea name="description" defaultValue={item.description || ""} rows={3} />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-700">Priority</label>
              <span className="inline-flex items-center gap-1 rounded bg-amber-50 border border-amber-200 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                🛡️ Team Lead only
              </span>
            </div>
            <Select name="priority" defaultValue={item.priority}>
              {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </Select>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-700">Team</label>
              <span className="inline-flex items-center gap-1 rounded bg-amber-50 border border-amber-200 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                🛡️ Team Lead only
              </span>
            </div>
            <Select name="team_id" defaultValue={String(item.team_id)}>
              {(teams.data || []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Due Date</label>
            <Input name="due_at" type="datetime-local" defaultValue={dueLocal} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              type="button"
              onClick={() => {
                setEditOpen(false);
                setEditPermissionError(null);
              }}
            >
              Cancel
            </Button>
            <Button type="submit">Save Changes</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
