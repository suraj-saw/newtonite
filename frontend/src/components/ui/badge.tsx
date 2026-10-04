import { cn } from "@/lib/utils";

const colors: Record<string, string> = {
  OPEN: "bg-sky-100 text-sky-800",
  IN_PROGRESS: "bg-indigo-100 text-indigo-800",
  PENDING_APPROVAL: "bg-purple-100 text-purple-900 border border-purple-200",
  BLOCKED: "bg-amber-100 text-amber-900",
  RESOLVED: "bg-emerald-100 text-emerald-800",
  CLOSED: "bg-slate-200 text-slate-700",
  LOW: "bg-slate-100 text-slate-700",
  MEDIUM: "bg-blue-100 text-blue-800",
  HIGH: "bg-orange-100 text-orange-800",
  CRITICAL: "bg-red-100 text-red-800",
  APPROVED: "bg-emerald-100 text-emerald-800",
  PENDING: "bg-amber-100 text-amber-900",
  REJECTED: "bg-rose-100 text-rose-800",
  Admin: "bg-purple-100 text-purple-800",
  Member: "bg-slate-100 text-slate-700",
  TEAM_LEAD: "bg-blue-100 text-blue-800",
  MEMBER: "bg-slate-100 text-slate-700",
};

export function Badge({ children, value }: { children?: string; value?: string }) {
  const text = children || value || "";
  return (
    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", colors[text] || "bg-muted")}>
      {text.replaceAll("_", " ")}
    </span>
  );
}
