import { useState } from "react";
import { Link } from "react-router-dom";
import type { StatusDistributionItem } from "@/types";

interface StatusDonutChartProps {
  data: StatusDistributionItem[];
  total: number;
}

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; hoverColor: string; bg: string; text: string }
> = {
  OPEN: {
    label: "Open",
    color: "#0284c7", // sky-600
    hoverColor: "#0369a1",
    bg: "bg-sky-50 text-sky-700 border-sky-200",
    text: "text-sky-700",
  },
  IN_PROGRESS: {
    label: "In progress",
    color: "#4f46e5", // indigo-600
    hoverColor: "#4338ca",
    bg: "bg-indigo-50 text-indigo-700 border-indigo-200",
    text: "text-indigo-700",
  },
  PENDING_APPROVAL: {
    label: "Pending approval",
    color: "#9333ea", // purple-600
    hoverColor: "#7e22ce",
    bg: "bg-purple-50 text-purple-700 border-purple-200",
    text: "text-purple-700",
  },
  BLOCKED: {
    label: "Blocked",
    color: "#d97706", // amber-600
    hoverColor: "#b45309",
    bg: "bg-amber-50 text-amber-700 border-amber-200",
    text: "text-amber-700",
  },
  RESOLVED: {
    label: "Resolved",
    color: "#059669", // emerald-600
    hoverColor: "#047857",
    bg: "bg-emerald-50 text-emerald-700 border-emerald-200",
    text: "text-emerald-700",
  },
  CLOSED: {
    label: "Closed",
    color: "#64748b", // slate-500
    hoverColor: "#475569",
    bg: "bg-slate-100 text-slate-700 border-slate-200",
    text: "text-slate-700",
  },
};

export function StatusDonutChart({ data, total }: StatusDonutChartProps) {
  const [hoveredStatus, setHoveredStatus] = useState<string | null>(null);

  // Compute status map ensuring all statuses exist even if 0
  const order = ["OPEN", "IN_PROGRESS", "PENDING_APPROVAL", "BLOCKED", "RESOLVED", "CLOSED"];
  const countMap = new Map<string, number>();
  for (const item of data) {
    countMap.set(item.status, item.count);
  }

  const items = order.map((status) => ({
    status,
    count: countMap.get(status) || 0,
    config: STATUS_CONFIG[status] || {
      label: status,
      color: "#94a3b8",
      hoverColor: "#64748b",
      bg: "bg-slate-50 text-slate-700 border-slate-200",
      text: "text-slate-700",
    },
  }));

  const activeTotal = total > 0 ? total : items.reduce((acc, curr) => acc + curr.count, 0);

  // SVG Donut calculations
  const size = 180;
  const strokeWidth = 24;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  let accumulatedPercent = 0;
  const slices = items
    .filter((i) => i.count > 0)
    .map((item) => {
      const percent = activeTotal > 0 ? (item.count / activeTotal) : 0;
      const strokeDasharray = `${percent * circumference} ${circumference}`;
      const strokeDashoffset = -accumulatedPercent * circumference;
      accumulatedPercent += percent;

      return {
        ...item,
        percent: Math.round(percent * 100),
        strokeDasharray,
        strokeDashoffset,
      };
    });

  const activeHoverItem = hoveredStatus ? items.find((i) => i.status === hoveredStatus) : null;

  return (
    <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between pb-4 border-b border-slate-100">
        <div>
          <h3 className="font-semibold text-slate-900 text-base">Work Items by Status</h3>
          <p className="text-xs text-slate-500 mt-0.5">Distribution across operational pipeline</p>
        </div>
        <span className="text-xs font-medium text-slate-500 bg-slate-50 border border-slate-200 px-2 py-1 rounded-md">
          {activeTotal} total
        </span>
      </div>

      <div className="mt-6 flex flex-col md:flex-row items-center gap-6">
        {/* SVG Donut */}
        <div className="relative flex items-center justify-center shrink-0">
          <svg width={size} height={size} className="rotate-[-90deg] transform">
            {/* Background Circle */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="transparent"
              stroke="#f1f5f9"
              strokeWidth={strokeWidth}
            />

            {/* Slices */}
            {slices.map((slice) => {
              const isHovered = hoveredStatus === slice.status;
              return (
                <circle
                  key={slice.status}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="transparent"
                  stroke={isHovered ? slice.config.hoverColor : slice.config.color}
                  strokeWidth={isHovered ? strokeWidth + 4 : strokeWidth}
                  strokeDasharray={slice.strokeDasharray}
                  strokeDashoffset={slice.strokeDashoffset}
                  strokeLinecap="round"
                  className="transition-all duration-200 cursor-pointer"
                  onMouseEnter={() => setHoveredStatus(slice.status)}
                  onMouseLeave={() => setHoveredStatus(null)}
                />
              );
            })}
          </svg>

          {/* Center Label */}
          <div className="absolute flex flex-col items-center justify-center text-center pointer-events-none">
            {activeHoverItem ? (
              <>
                <span className="text-2xl font-bold tracking-tight text-slate-900">
                  {activeHoverItem.count}
                </span>
                <span className="text-[11px] font-medium text-slate-500 max-w-[80px] truncate">
                  {activeHoverItem.config.label}
                </span>
              </>
            ) : (
              <>
                <span className="text-2xl font-bold tracking-tight text-slate-900">
                  {activeTotal}
                </span>
                <span className="text-[11px] font-medium text-slate-400">Total</span>
              </>
            )}
          </div>
        </div>

        {/* Legend with interactive progress bars */}
        <div className="flex-1 w-full space-y-2.5">
          {items.map((item) => {
            const percent = activeTotal > 0 ? Math.round((item.count / activeTotal) * 100) : 0;
            const isHovered = hoveredStatus === item.status;

            return (
              <Link
                key={item.status}
                to={`/work-items?status=${item.status}`}
                onMouseEnter={() => setHoveredStatus(item.status)}
                onMouseLeave={() => setHoveredStatus(null)}
                className={`group flex items-center justify-between gap-3 p-1.5 px-2 rounded-lg transition-all ${
                  isHovered ? "bg-slate-50 shadow-xs" : "hover:bg-slate-50/60"
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-[130px]">
                  <span
                    className="h-3 w-3 rounded-full shrink-0 transition-transform group-hover:scale-125"
                    style={{ backgroundColor: item.config.color }}
                  />
                  <span className="text-xs font-medium text-slate-700 group-hover:text-slate-900">
                    {item.config.label}
                  </span>
                </div>

                {/* Progress bar */}
                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden max-w-[140px] hidden sm:block">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${percent}%`,
                      backgroundColor: item.config.color,
                    }}
                  />
                </div>

                <div className="flex items-center gap-2 text-right shrink-0">
                  <span className="text-xs font-bold text-slate-900 min-w-[20px]">
                    {item.count}
                  </span>
                  <span className="text-[11px] text-slate-400 min-w-[32px]">
                    {percent}%
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
