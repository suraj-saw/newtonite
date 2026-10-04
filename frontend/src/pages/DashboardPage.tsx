/**
 * DashboardPage Component
 *
 * Operational Command Center providing consolidated metrics and distribution charts.
 *
 * Architecture & Features:
 * - Single Round-Trip Aggregation: Reads pre-computed counts and breakdown slices from `/dashboard/summary`,
 *   computed server-side with user visibility scoping.
 * - Interactive Metric Cards: High-level KPI counters (Active, High/Critical, Assigned to me, Overdue, Blocked,
 *   Unassigned, Recently Updated) that deep-link directly into pre-filtered views on `/work-items`.
 * - Visual Workload Analytics:
 *   - Status Donut Chart: Proportional distribution of work items across state machine phases.
 *   - Priority Bar Chart: Triage urgency distribution.
 *   - Type Distribution Chart: Category breakdown (Customer Issue, Bug, Incident, Compliance, Operational).
 *   - Team Workload Chart: Distribution of pending tasks across teams.
 *   - Operational Health Metrics: SLA compliance and cycle time indicators.
 */

import { Link } from "react-router-dom";
import { ArrowRight, BarChart3 } from "lucide-react";
import { useDashboard } from "@/hooks/use-api";
import { useAuthStore } from "@/store/auth";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState, Spinner } from "@/components/ui/states";
import { StatusDonutChart } from "@/components/dashboard/StatusDonutChart";
import { PriorityBarChart } from "@/components/dashboard/PriorityBarChart";
import { TypeDistributionChart } from "@/components/dashboard/TypeDistributionChart";
import { TeamWorkloadChart } from "@/components/dashboard/TeamWorkloadChart";
import { OperationalHealthMetrics } from "@/components/dashboard/OperationalHealthMetrics";

/**
 * Metric cards configuration: label title and payload property key.
 */
const cards = [
  ["Active", "active"],
  ["High / critical", "high_or_critical"],
  ["Assigned to me", "assigned_to_me"],
  ["Overdue", "overdue"],
  ["Blocked", "blocked"],
  ["Unassigned", "unassigned"],
  ["Updated (24h)", "recently_updated"],
] as const;

/**
 * Maps metric card keys to corresponding `/work-items` search parameter routes.
 */
function getCardFilterLink(key: string, userId?: number): string {
  switch (key) {
    case "active":
      return "/work-items?status=OPEN";
    case "high_or_critical":
      return "/work-items?priority=HIGH";
    case "assigned_to_me":
      return userId ? `/work-items?assignee_id=${userId}` : "/work-items";
    case "overdue":
      return "/work-items?sort=due_at";
    case "blocked":
      return "/work-items?status=BLOCKED";
    case "unassigned":
      return "/work-items?unassigned=true";
    case "recently_updated":
      return "/work-items?sort=-updated_at";
    default:
      return "/work-items";
  }
}

/**
 * Executive and operational dashboard rendering KPI cards and data visualization charts.
 */
export function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const { data, isLoading, isError, error } = useDashboard();

  if (isLoading) return <Spinner />;
  if (isError) return <ErrorState message={error instanceof Error ? error.message : "Failed to load dashboard"} />;
  if (!data) return <EmptyState title="No dashboard data" />;

  const totalCalculated =
    data.total_items ||
    (data.status_distribution && data.status_distribution.length > 0
      ? data.status_distribution.reduce((acc, curr) => acc + curr.count, 0)
      : data.active);

  return (
    <div className="space-y-8">
      {/* Page Title */}
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">What needs attention</h1>
        <p className="text-sm text-slate-500">
          Counts are aggregated on the server for your visible teams. Click any card to view filtered work items.
        </p>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, key]) => {
          const isAssignedCard = key === "assigned_to_me";
          const count = data[key];
          return (
            <Link
              key={key}
              to={getCardFilterLink(key, user?.id)}
              className="group block transition-all duration-150"
            >
              <Card
                className={`relative h-full transition-all duration-150 group-hover:-translate-y-0.5 group-hover:shadow-md ${
                  isAssignedCard
                    ? "border-primary/40 bg-primary/[0.03] group-hover:border-primary group-hover:bg-primary/[0.06]"
                    : "hover:border-slate-400"
                }`}
              >
                <div className="flex items-center justify-between text-sm text-slate-500">
                  <span className="font-medium group-hover:text-slate-800">{label}</span>
                  <span className="flex items-center gap-0.5 text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                    View &rarr;
                  </span>
                </div>
                <div className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
                  {count}
                </div>
                {isAssignedCard && (
                  <div className="mt-2 text-xs font-medium text-primary">
                    {count === 1 ? "1 item assigned to you" : `${count} items assigned to you`}
                  </div>
                )}
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Visualizations & Analytics Section */}
      <div className="space-y-6 pt-2">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border pb-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <BarChart3 className="h-4 w-4" />
              </div>
              <h2 className="text-xl font-bold tracking-tight text-slate-900">
                Operational Analytics & Visualizations
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Visual breakdown of work item workflow status, priority risk, domain categories, and team velocity.
            </p>
          </div>

          <Link
            to="/work-items"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline self-start sm:self-auto"
          >
            <span>Explore all work items</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {/* 1. High-Level Operational Health KPIs */}
        <OperationalHealthMetrics summary={data} />

        {/* 2. Charts Row 1: Status Donut & Priority Bar Chart */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <StatusDonutChart
            data={data.status_distribution || []}
            total={totalCalculated}
          />
          <PriorityBarChart
            data={data.priority_distribution || []}
            total={totalCalculated}
          />
        </div>

        {/* 3. Charts Row 2: Category Breakdown & Team Workload */}
        <div className="space-y-6">
          <TypeDistributionChart
            data={data.type_distribution || []}
            total={totalCalculated}
          />

          {data.team_distribution && data.team_distribution.length > 0 && (
            <TeamWorkloadChart
              data={data.team_distribution}
              totalActive={data.active}
            />
          )}
        </div>
      </div>
    </div>
  );
}
