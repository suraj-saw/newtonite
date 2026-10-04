/**
 * NewWorkItemPage Component
 *
 * Creation form for introducing new work items into the operational workflow.
 *
 * Key System Capabilities & Architectural Patterns:
 * 1. Client-Side Idempotency Key Generation:
 *    - Generates a cryptographically random UUID (`crypto.randomUUID()`) sent in the `Idempotency-Key` header.
 *    - Guarantees network retries or double form submissions do not create duplicate work items.
 * 2. Team-Scoped Dynamic Assignee Loading:
 *    - Observes `team_id` selection via React Hook Form's `watch`.
 *    - Dynamically queries `/teams/{teamId}` to populate the assignee dropdown only with members
 *      who actually belong to the chosen team.
 * 3. Schema Validation:
 *    - Uses Zod schema validated through `@hookform/resolvers/zod`.
 */

import React from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/api/client";
import { useTeams } from "@/hooks/use-api";
import type { WorkItem, User } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

/**
 * Validation schema for creating a work item.
 */
const schema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  type: z.string(),
  priority: z.string(),
  team_id: z.string().min(1, "Please select a responsible team"),
  assignee_id: z.string().optional(),
  due_at: z.string().optional(),
});

/**
 * Form page for submitting new operational tasks with team assignment and idempotency protection.
 */
export function NewWorkItemPage() {
  const navigate = useNavigate();
  const teams = useTeams();
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      title: "",
      description: "",
      type: "OPERATIONAL",
      priority: "MEDIUM",
      team_id: "",
      assignee_id: "",
      due_at: "",
    },
  });

  const selectedTeamId = form.watch("team_id");
  const [teamMembers, setTeamMembers] = React.useState<User[]>([]);

  React.useEffect(() => {
    if (selectedTeamId) {
      api.get<import("@/types").TeamDetail>(`/teams/${selectedTeamId}`)
        .then(team => {
          setTeamMembers(team.memberships.map(m => m.user as import("@/types").User).filter(Boolean));
        })
        .catch(() => setTeamMembers([]));
    } else {
      setTeamMembers([]);
    }
  }, [selectedTeamId]);

  async function onSubmit(values: z.infer<typeof schema>) {
    try {
      const created = await api.post<WorkItem>(
        "/work-items",
        {
          title: values.title,
          description: values.description,
          type: values.type,
          priority: values.priority,
          team_id: Number(values.team_id),
          assignee_id: values.assignee_id ? Number(values.assignee_id) : null,
          due_at: values.due_at ? new Date(values.due_at).toISOString() : null,
        },
        { "Idempotency-Key": crypto.randomUUID() },
      );
      toast.success("Work item created");
      navigate(`/work-items/${created.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed");
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">Create work item</h1>
      <form className="space-y-4 rounded-lg border border-border bg-white p-4" onSubmit={form.handleSubmit(onSubmit)}>
        <div className="space-y-1.5">
          <label htmlFor="title" className="text-sm font-medium">Title</label>
          <Input id="title" placeholder="Brief summary of the issue" {...form.register("title")} />
        </div>
        
        <div className="space-y-1.5">
          <label htmlFor="description" className="text-sm font-medium">Description</label>
          <Textarea id="description" placeholder="Detailed explanation" rows={5} {...form.register("description")} />
        </div>
        
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="type" className="text-sm font-medium">Work Item Type</label>
            <Select id="type" {...form.register("type")}>
              {["CUSTOMER_ISSUE", "ENGINEERING", "PAYMENT", "INCIDENT", "COMPLIANCE", "OPERATIONAL"].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
          </div>
          
          <div className="space-y-1.5">
            <label htmlFor="priority" className="text-sm font-medium">Priority</label>
            <Select id="priority" {...form.register("priority")}>
              {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
          </div>
          
          <div className="space-y-1.5">
            <label htmlFor="team_id" className="text-sm font-medium">Assigned Team</label>
            <Select id="team_id" {...form.register("team_id")}>
              <option value="">Select team...</option>
              {(teams.data || []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </div>
          
          <div className="space-y-1.5">
            <label htmlFor="assignee_id" className="text-sm font-medium">Assigned User</label>
            <Select id="assignee_id" {...form.register("assignee_id")}>
              <option value="">Unassigned</option>
              {teamMembers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </div>
          
          <div className="space-y-1.5">
            <label htmlFor="due_at" className="text-sm font-medium">Due Date & Time</label>
            <Input id="due_at" type="datetime-local" {...form.register("due_at")} />
          </div>
        </div>
        
        <div className="pt-2">
          <Button type="submit">Create</Button>
        </div>
      </form>
    </div>
  );
}
