import { Link } from "react-router-dom";
import { Users2, ArrowRight } from "lucide-react";
import type { TeamDistributionItem } from "@/types";

interface TeamWorkloadChartProps {
  data: TeamDistributionItem[];
  totalActive: number;
}

export function TeamWorkloadChart({ data, totalActive }: TeamWorkloadChartProps) {
  if (!data || data.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between pb-4 border-b border-slate-100">
        <div>
          <h3 className="font-semibold text-slate-900 text-base">Team Workload & Throughput</h3>
          <p className="text-xs text-slate-500 mt-0.5">Active backlog vs resolved work per team</p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-indigo-600" />
            <span className="text-slate-600">Active</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />
            <span className="text-slate-600">Resolved</span>
          </div>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {data.map((team) => {
          const activePercentOfTeam = team.total > 0 ? (team.active / team.total) * 100 : 0;
          const resolvedPercentOfTeam = team.total > 0 ? (team.resolved / team.total) * 100 : 0;
          const shareOfAllActive = totalActive > 0 ? Math.round((team.active / totalActive) * 100) : 0;

          return (
            <Link
              key={team.team_id}
              to={`/work-items?team_id=${team.team_id}`}
              className="group block p-3 rounded-xl border border-slate-100 hover:border-slate-300 hover:bg-slate-50/60 transition-all"
            >
              <div className="flex items-center justify-between text-xs mb-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded bg-slate-100 text-slate-600 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                    <Users2 className="h-3.5 w-3.5" />
                  </div>
                  <span className="font-semibold text-sm text-slate-900 group-hover:text-primary transition-colors">
                    {team.team_name}
                  </span>
                  <span className="text-[11px] text-slate-400 font-medium">
                    ({team.total} total items)
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                    {team.active} active
                  </span>
                  <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                    {team.resolved} resolved
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 text-slate-400 group-hover:text-primary transition-colors" />
                </div>
              </div>

              {/* Comparative Dual Track Bar */}
              <div className="relative h-3 w-full bg-slate-100 rounded-full overflow-hidden flex">
                {/* Active portion */}
                <div
                  className="h-full bg-indigo-600 transition-all duration-500"
                  style={{ width: `${activePercentOfTeam}%` }}
                  title={`${team.active} active`}
                />
                {/* Resolved portion */}
                <div
                  className="h-full bg-emerald-500 transition-all duration-500"
                  style={{ width: `${resolvedPercentOfTeam}%` }}
                  title={`${team.resolved} resolved`}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1.5">
                <span>Accounts for {shareOfAllActive}% of active operational volume</span>
                <span>
                  {team.total > 0 ? Math.round((team.resolved / team.total) * 100) : 0}% completion rate
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
