import { Link } from "react-router-dom";
import { AlertTriangle, Flame, ShieldAlert, Layers } from "lucide-react";
import type { PriorityDistributionItem } from "@/types";

interface PriorityBarChartProps {
  data: PriorityDistributionItem[];
  total: number;
}

const PRIORITY_CONFIG: Record<
  string,
  { label: string; color: string; barBg: string; text: string; icon: React.ComponentType<{ className?: string }> }
> = {
  CRITICAL: {
    label: "Critical",
    color: "#ef4444", // red-500
    barBg: "bg-red-500",
    text: "text-red-700",
    icon: Flame,
  },
  HIGH: {
    label: "High",
    color: "#f97316", // orange-500
    barBg: "bg-orange-500",
    text: "text-orange-700",
    icon: AlertTriangle,
  },
  MEDIUM: {
    label: "Medium",
    color: "#3b82f6", // blue-500
    barBg: "bg-blue-500",
    text: "text-blue-700",
    icon: ShieldAlert,
  },
  LOW: {
    label: "Low",
    color: "#64748b", // slate-500
    barBg: "bg-slate-400",
    text: "text-slate-700",
    icon: Layers,
  },
};

export function PriorityBarChart({ data, total }: PriorityBarChartProps) {
  const order = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
  const countMap = new Map<string, number>();
  for (const item of data) {
    countMap.set(item.priority, item.count);
  }

  const items = order.map((pri) => ({
    priority: pri,
    count: countMap.get(pri) || 0,
    config: PRIORITY_CONFIG[pri] || {
      label: pri,
      color: "#64748b",
      barBg: "bg-slate-400",
      text: "text-slate-700",
      icon: Layers,
    },
  }));

  const safeTotal = total > 0 ? total : items.reduce((acc, curr) => acc + curr.count, 0);
  const criticalAndHighCount = (countMap.get("CRITICAL") || 0) + (countMap.get("HIGH") || 0);

  return (
    <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between pb-4 border-b border-slate-100">
        <div>
          <h3 className="font-semibold text-slate-900 text-base">Priority Distribution</h3>
          <p className="text-xs text-slate-500 mt-0.5">Urgency and escalation weighting</p>
        </div>
        {criticalAndHighCount > 0 ? (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-md">
            <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
            {criticalAndHighCount} Urgent
          </span>
        ) : (
          <span className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-md">
            No urgent backlog
          </span>
        )}
      </div>

      <div className="mt-5 space-y-4">
        {items.map((item) => {
          const percent = safeTotal > 0 ? Math.round((item.count / safeTotal) * 100) : 0;
          const Icon = item.config.icon;

          return (
            <Link
              key={item.priority}
              to={`/work-items?priority=${item.priority}`}
              className="group block p-2 rounded-lg hover:bg-slate-50/80 transition-all"
            >
              <div className="flex items-center justify-between text-xs mb-1.5">
                <div className="flex items-center gap-2">
                  <div
                    className="flex h-5 w-5 items-center justify-center rounded text-white shadow-xs"
                    style={{ backgroundColor: item.config.color }}
                  >
                    <Icon className="h-3 w-3" />
                  </div>
                  <span className="font-semibold text-slate-800 group-hover:text-slate-900">
                    {item.config.label}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900">{item.count}</span>
                  <span className="text-slate-400">({percent}%)</span>
                </div>
              </div>

              {/* Bar track */}
              <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden p-0.5">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${item.config.barBg} group-hover:brightness-95`}
                  style={{ width: `${percent}%` }}
                />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
