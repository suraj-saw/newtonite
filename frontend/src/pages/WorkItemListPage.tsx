/**
 * WorkItemListPage Component
 *
 * Operational ledger view displaying paginated, searchable, and filterable work items.
 *
 * Core Features:
 * - URL Query State Synchronization: All search inputs, dropdown filters, pagination offsets,
 *   and quick-filter modes are persisted directly into URL search parameters (`useSearchParams`).
 * - Quick-Filter Presets: Instant switching between "All items", "Assigned to me", and "Unassigned".
 * - Multi-Dimensional Filtering: Filter by status, priority, type, team, and assignee.
 * - Full-Text Title Search: Live query debounced across the server repository layer.
 * - Real-Time Visual Indicators: Overdue badge flags, status pills, and direct navigation links.
 */

import { Link, useSearchParams } from "react-router-dom";
import { useWorkItems, useTeams, useUsers } from "@/hooks/use-api";
import { useAuthStore } from "@/store/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EmptyState, ErrorState, Spinner } from "@/components/ui/states";
import { formatDate, isOverdue } from "@/lib/utils";
import { WORK_ITEM_STATUSES, WORK_ITEM_PRIORITIES, WORK_ITEM_TYPES } from "@/features/work-items/constants";

/**
 * Main ledger table view for querying and triaging work items.
 */
export function WorkItemListPage() {
  const user = useAuthStore((s) => s.user);
  const [params, setParams] = useSearchParams();
  const query = useWorkItems(params);
  const teams = useTeams();
  const users = useUsers();

  /**
   * Update a specific URL search parameter while resetting pagination to page 1.
   */
  function update(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.set("page", "1");
    setParams(next);
  }

  function setQuickFilter(mode: "all" | "assigned_to_me" | "unassigned") {
    const next = new URLSearchParams(params);
    next.set("page", "1");
    if (mode === "all") {
      next.delete("assignee_id");
      next.delete("unassigned");
    } else if (mode === "assigned_to_me") {
      next.delete("unassigned");
      if (user?.id) next.set("assignee_id", String(user.id));
    } else if (mode === "unassigned") {
      next.delete("assignee_id");
      next.set("unassigned", "true");
    }
    setParams(next);
  }

  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const page = Number(params.get("page") || 1);
  const pageSize = Number(params.get("page_size") || 20);
  const pages = Math.max(1, Math.ceil(total / pageSize));

  const isAssignedToMe = Boolean(user?.id && params.get("assignee_id") === String(user.id));
  const isUnassigned = params.get("unassigned") === "true";
  const isAll = !params.get("assignee_id") && !isUnassigned;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Work items</h1>
          <p className="text-sm text-slate-500">Track, manage, and coordinate team tasks and issues.</p>
        </div>
        <Link to="/work-items/new">
          <Button>Create work item</Button>
        </Link>
      </div>

      {/* Quick Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
        <button
          type="button"
          onClick={() => setQuickFilter("all")}
          className={`rounded-full px-3.5 py-1 text-xs font-medium transition-colors ${
            isAll
              ? "bg-slate-900 text-white"
              : "bg-muted text-slate-600 hover:bg-slate-200"
          }`}
        >
          All items
        </button>
        {user && (
          <button
            type="button"
            onClick={() => setQuickFilter("assigned_to_me")}
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-1 text-xs font-medium transition-colors ${
              isAssignedToMe
                ? "bg-primary text-white"
                : "bg-muted text-slate-600 hover:bg-slate-200"
            }`}
          >
            <span>Assigned to me</span>
            <span className={isAssignedToMe ? "text-primary-foreground/80 text-[11px]" : "text-slate-400 text-[11px]"}>
              ({user.name})
            </span>
          </button>
        )}
        <button
          type="button"
          onClick={() => setQuickFilter("unassigned")}
          className={`rounded-full px-3.5 py-1 text-xs font-medium transition-colors ${
            isUnassigned
              ? "bg-slate-900 text-white"
              : "bg-muted text-slate-600 hover:bg-slate-200"
          }`}
        >
          Unassigned
        </button>

        {(isAssignedToMe || isUnassigned || params.get("status") || params.get("priority") || params.get("search")) && (
          <button
            type="button"
            onClick={() => setParams(new URLSearchParams())}
            className="ml-auto text-xs text-slate-500 hover:text-slate-800 underline underline-offset-2"
          >
            Reset all filters
          </button>
        )}
      </div>

      {/* Active Filter Notice */}
      {isAssignedToMe && (
        <div className="flex items-center justify-between rounded-md bg-blue-50/60 border border-blue-200 px-3.5 py-2 text-xs text-blue-900">
          <div className="flex items-center gap-2">
            <span className="font-semibold">Filter active:</span>
            <span>Showing items assigned to you ({user?.name})</span>
          </div>
          <button
            type="button"
            onClick={() => setQuickFilter("all")}
            className="font-medium text-blue-700 hover:underline"
          >
            Show all items &times;
          </button>
        </div>
      )}

      {/* Filter Row */}
      <div className="grid gap-2 md:grid-cols-4 xl:grid-cols-8">
        <Input
          placeholder="Search title or description"
          defaultValue={params.get("search") || ""}
          onBlur={(e) => update("search", e.target.value)}
        />
        {["status", "priority", "type"].map((key) => (
          <Select key={key} value={params.get(key) || ""} onChange={(e) => update(key, e.target.value)}>
            <option value="">{key}</option>
            {(key === "status"
              ? WORK_ITEM_STATUSES
              : key === "priority"
                ? WORK_ITEM_PRIORITIES
                : WORK_ITEM_TYPES
            ).map((v) => (
              <option key={v} value={v}>
                {v.replaceAll("_", " ")}
              </option>
            ))}
          </Select>
        ))}
        <Select value={params.get("team_id") || ""} onChange={(e) => update("team_id", e.target.value)}>
          <option value="">team</option>
          {(teams.data || []).map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
        <Select
          value={isUnassigned ? "UNASSIGNED" : params.get("assignee_id") || ""}
          onChange={(e) => {
            const val = e.target.value;
            const next = new URLSearchParams(params);
            if (val === "UNASSIGNED") {
              next.delete("assignee_id");
              next.set("unassigned", "true");
            } else {
              next.delete("unassigned");
              if (val) next.set("assignee_id", val);
              else next.delete("assignee_id");
            }
            next.set("page", "1");
            setParams(next);
          }}
        >
          <option value="">assignee</option>
          {user && <option value={String(user.id)}>Assigned to me ({user.name})</option>}
          <option value="UNASSIGNED">Unassigned</option>
          <optgroup label="All members">
            {(users.data || []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </optgroup>
        </Select>
        <Select value={params.get("sort") || "-updated_at"} onChange={(e) => update("sort", e.target.value)}>
          <option value="-updated_at">Updated desc</option>
          <option value="updated_at">Updated asc</option>
          <option value="due_at">Due asc</option>
          <option value="-due_at">Due desc</option>
          <option value="priority">Priority</option>
        </Select>
      </div>

      {query.isLoading ? <Spinner /> : null}
      {query.isError ? <ErrorState message={query.error instanceof Error ? query.error.message : "Failed"} /> : null}
      {!query.isLoading && items.length === 0 ? <EmptyState title="No work items match these filters" /> : null}

      {items.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-border bg-white shadow-sm">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-muted">
              <tr>
                {["ID", "Title", "Type", "Priority", "Status", "Team", "Assignee", "Due", "Updated"].map((h) => (
                  <th key={h} className="p-2.5 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-border hover:bg-slate-50/80 transition-colors">
                  <td className="p-2.5 font-mono text-xs text-slate-500">#{item.id}</td>
                  <td className="p-2.5">
                    <Link className="font-medium text-primary hover:underline" to={`/work-items/${item.id}`}>
                      {item.title}
                    </Link>
                    {isOverdue(item.due_at, item.status) ? (
                      <span className="ml-2 inline-flex items-center rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                        Overdue
                      </span>
                    ) : null}
                    {item.status === "BLOCKED" && item.blocked_reason ? (
                      <p className="mt-0.5 text-xs text-amber-700 line-clamp-1 font-medium">
                        ⚠️ Pending: {item.blocked_reason}
                      </p>
                    ) : null}
                  </td>
                  <td className="p-2.5 text-slate-600">{item.type.replaceAll("_", " ")}</td>
                  <td className="p-2.5">
                    <Badge value={item.priority} />
                  </td>
                  <td className="p-2.5">
                    <Badge value={item.status} />
                  </td>
                  <td className="p-2.5 text-slate-600">{item.team_name}</td>
                  <td className="p-2.5">
                    {item.assignee_id === user?.id ? (
                      <span className="inline-flex items-center gap-1 font-medium text-primary">
                        {item.assignee_name}
                        <span className="text-[10px] bg-primary/10 px-1.5 py-0.2 rounded font-normal">(You)</span>
                      </span>
                    ) : (
                      <span className="text-slate-600">{item.assignee_name || "Unassigned"}</span>
                    )}
                  </td>
                  <td className="p-2.5 text-slate-600">{formatDate(item.due_at)}</td>
                  <td className="p-2.5 text-slate-600">{formatDate(item.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-500">
          {total} items · page {page} of {pages}
        </span>
        <div className="flex gap-2">
          <Button variant="secondary" disabled={page <= 1} onClick={() => update("page", String(page - 1))}>
            Previous
          </Button>
          <Button variant="secondary" disabled={page >= pages} onClick={() => update("page", String(page + 1))}>
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
