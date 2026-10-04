import { CheckCircle2, AlertOctagon, Clock, UserCheck } from "lucide-react";
import type { DashboardSummary } from "@/types";

interface OperationalHealthMetricsProps {
  summary: DashboardSummary;
}

export function OperationalHealthMetrics({ summary }: OperationalHealthMetricsProps) {
  const total = summary.total_items || 0;
  const active = summary.active || 0;
  const resolved = (summary.status_distribution || [])
    .filter((s) => s.status === "RESOLVED" || s.status === "CLOSED")
    .reduce((acc, curr) => acc + curr.count, 0);

  // Resolution Rate (% of all lifetime items resolved)
  const resolutionRate = total > 0 ? Math.round((resolved / total) * 100) : 0;

  // Blocked Ratio (% of active items blocked)
  const blockedRatio = active > 0 ? Math.round((summary.blocked / active) * 100) : 0;

  // Overdue Ratio (% of active items overdue)
  const overdueRatio = active > 0 ? Math.round((summary.overdue / active) * 100) : 0;

  // Assignment Coverage (% of active items with an assignee)
  const unassigned = summary.unassigned || 0;
  const assignedActive = Math.max(0, active - unassigned);
  const assignmentCoverage = active > 0 ? Math.round((assignedActive / active) * 100) : 100;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* 1. Resolution Rate */}
      <div className="rounded-xl border border-border bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-500">Resolution Rate</span>
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-2xl font-bold text-slate-900">{resolutionRate}%</span>
          <span className="text-xs text-slate-500">completed</span>
        </div>
        <div className="mt-2 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all duration-700"
            style={{ width: `${resolutionRate}%` }}
          />
        </div>
        <p className="mt-2 text-[11px] text-slate-400">
          {resolved} of {total} lifetime work items resolved
        </p>
      </div>

      {/* 2. Blocked Rate */}
      <div className="rounded-xl border border-border bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-500">Blocked Workload</span>
          <div
            className={`flex h-7 w-7 items-center justify-center rounded-lg ${
              blockedRatio > 10 ? "bg-amber-50 text-amber-600" : "bg-slate-100 text-slate-600"
            }`}
          >
            <AlertOctagon className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-2xl font-bold text-slate-900">{blockedRatio}%</span>
          <span className="text-xs text-slate-500">of active items</span>
        </div>
        <div className="mt-2 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${
              blockedRatio > 10 ? "bg-amber-500" : "bg-slate-400"
            }`}
            style={{ width: `${blockedRatio}%` }}
          />
        </div>
        <p className="mt-2 text-[11px] text-slate-400">
          {summary.blocked} item{summary.blocked === 1 ? "" : "s"} currently stalled
        </p>
      </div>

      {/* 3. Overdue Rate */}
      <div className="rounded-xl border border-border bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-500">Overdue Risk</span>
          <div
            className={`flex h-7 w-7 items-center justify-center rounded-lg ${
              summary.overdue > 0 ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600"
            }`}
          >
            <Clock className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-2xl font-bold text-slate-900">{overdueRatio}%</span>
          <span className="text-xs text-slate-500">missed due dates</span>
        </div>
        <div className="mt-2 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${
              summary.overdue > 0 ? "bg-rose-500" : "bg-emerald-500"
            }`}
            style={{ width: `${overdueRatio}%` }}
          />
        </div>
        <p className="mt-2 text-[11px] text-slate-400">
          {summary.overdue} active item{summary.overdue === 1 ? "" : "s"} past due date
        </p>
      </div>

      {/* 4. Assignment Coverage */}
      <div className="rounded-xl border border-border bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-500">Assignment Coverage</span>
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <UserCheck className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-2xl font-bold text-slate-900">{assignmentCoverage}%</span>
          <span className="text-xs text-slate-500">ownership</span>
        </div>
        <div className="mt-2 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-700"
            style={{ width: `${assignmentCoverage}%` }}
          />
        </div>
        <p className="mt-2 text-[11px] text-slate-400">
          {assignedActive} of {active} active items claimed
        </p>
      </div>
    </div>
  );
}
