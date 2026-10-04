import { Link } from "react-router-dom";
import {
  LifeBuoy,
  Code2,
  CreditCard,
  AlertOctagon,
  FileCheck2,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import type { TypeDistributionItem } from "@/types";

interface TypeDistributionChartProps {
  data: TypeDistributionItem[];
  total: number;
}

const TYPE_CONFIG: Record<
  string,
  { label: string; icon: LucideIcon; color: string; bg: string }
> = {
  CUSTOMER_ISSUE: {
    label: "Customer issue",
    icon: LifeBuoy,
    color: "#0284c7", // sky-600
    bg: "bg-sky-50 text-sky-700",
  },
  ENGINEERING: {
    label: "Engineering",
    icon: Code2,
    color: "#6366f1", // indigo-500
    bg: "bg-indigo-50 text-indigo-700",
  },
  PAYMENT: {
    label: "Payment",
    icon: CreditCard,
    color: "#059669", // emerald-600
    bg: "bg-emerald-50 text-emerald-700",
  },
  INCIDENT: {
    label: "Incident",
    icon: AlertOctagon,
    color: "#dc2626", // red-600
    bg: "bg-red-50 text-red-700",
  },
  COMPLIANCE: {
    label: "Compliance",
    icon: FileCheck2,
    color: "#d97706", // amber-600
    bg: "bg-amber-50 text-amber-700",
  },
  OPERATIONAL: {
    label: "Operational",
    icon: SlidersHorizontal,
    color: "#475569", // slate-600
    bg: "bg-slate-100 text-slate-700",
  },
};

export function TypeDistributionChart({ data, total }: TypeDistributionChartProps) {
  const order = [
    "CUSTOMER_ISSUE",
    "ENGINEERING",
    "PAYMENT",
    "INCIDENT",
    "COMPLIANCE",
    "OPERATIONAL",
  ];
  const countMap = new Map<string, number>();
  for (const item of data) {
    countMap.set(item.type, item.count);
  }

  const items = order.map((type) => ({
    type,
    count: countMap.get(type) || 0,
    config: TYPE_CONFIG[type] || {
      label: type.replaceAll("_", " "),
      icon: SlidersHorizontal,
      color: "#64748b",
      bg: "bg-slate-100 text-slate-700",
    },
  }));

  const safeTotal = total > 0 ? total : items.reduce((acc, curr) => acc + curr.count, 0);

  return (
    <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between pb-4 border-b border-slate-100">
        <div>
          <h3 className="font-semibold text-slate-900 text-base">Work Items by Category</h3>
          <p className="text-xs text-slate-500 mt-0.5">Classification across operational domains</p>
        </div>
        <span className="text-xs text-slate-400">6 categories</span>
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map((item) => {
          const percent = safeTotal > 0 ? Math.round((item.count / safeTotal) * 100) : 0;
          const Icon = item.config.icon;

          return (
            <Link
              key={item.type}
              to={`/work-items?type=${item.type}`}
              className="group flex flex-col justify-between p-3.5 rounded-xl border border-slate-100 bg-slate-50/40 hover:bg-white hover:border-slate-300 hover:shadow-xs transition-all"
            >
              <div className="flex items-center justify-between mb-2">
                <div className={`p-2 rounded-lg ${item.config.bg}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="text-right">
                  <span className="text-lg font-bold text-slate-900 leading-none">
                    {item.count}
                  </span>
                  <span className="text-[10px] text-slate-400 block mt-0.5">
                    {percent}% of total
                  </span>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-800 group-hover:text-slate-900 truncate">
                  {item.config.label}
                </p>
                {/* Mini progress bar */}
                <div className="mt-2 h-1.5 w-full bg-slate-200/70 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${percent}%`,
                      backgroundColor: item.config.color,
                    }}
                  />
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
