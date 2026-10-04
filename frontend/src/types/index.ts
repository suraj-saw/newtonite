/**
 * Domain Type Definitions and API Contracts
 *
 * Strongly typed TypeScript interfaces mirroring backend Pydantic schemas
 * for entities, API responses, dashboard metrics, and error payloads.
 */

/**
 * Operator user account representation.
 */
export type User = {
  id: number;
  name: string;
  email: string;
  is_active: boolean;
  is_admin: boolean;
  status: string;
  created_at: string;
  team_ids?: number[];
  lead_team_ids?: number[];
  memberships?: Membership[];
};

/**
 * Organizational team entity.
 */
export type Team = {
  id: number;
  name: string;
  description?: string | null;
};

/**
 * User membership association within an operational team.
 */
export type Membership = {
  id: number;
  user_id: number;
  team_id: number;
  role: string;
  user?: User | null;
  team?: Team | null;
};

/**
 * Team entity with full member roster loaded.
 */
export type TeamDetail = Team & {
  memberships: Membership[];
};

/**
 * Core operational work unit with version-gated concurrency control.
 */
export type WorkItem = {
  id: number;
  title: string;
  description?: string | null;
  type: string;
  status: string;
  priority: string;
  team_id: number;
  assignee_id?: number | null;
  created_by_id: number;
  due_at?: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  resolved_at?: string | null;
  blocked_reason?: string | null;
  team_name?: string | null;
  assignee_name?: string | null;
  created_by_name?: string | null;
};

/**
 * Generic paginated list envelope.
 */
export type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  page_size: number;
};

/**
 * Discussion note posted to a work item.
 */
export type Comment = {
  id: number;
  work_item_id: number;
  author_id: number;
  body: string;
  created_at: string;
  author_name?: string | null;
};

/**
 * Immutable historical audit log entry.
 */
export type Activity = {
  id: number;
  work_item_id: number;
  actor_id: number;
  action: string;
  field_name?: string | null;
  old_value?: string | null;
  new_value?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  actor_name?: string | null;
};

/**
 * Item distribution count by status.
 */
export type StatusDistributionItem = {
  status: string;
  count: number;
};

/**
 * Item distribution count by priority.
 */
export type PriorityDistributionItem = {
  priority: string;
  count: number;
};

/**
 * Item distribution count by work item type.
 */
export type TypeDistributionItem = {
  type: string;
  count: number;
};

/**
 * Workload statistics per team.
 */
export type TeamDistributionItem = {
  team_id: number;
  team_name: string;
  total: number;
  active: number;
  resolved: number;
};

/**
 * Analytical dashboard summary containing KPIs and workload charts.
 */
export type DashboardSummary = {
  active: number;
  high_or_critical: number;
  assigned_to_me: number;
  overdue: number;
  blocked: number;
  recently_updated: number;
  unassigned: number;
  total_items?: number;
  status_distribution?: StatusDistributionItem[];
  priority_distribution?: PriorityDistributionItem[];
  type_distribution?: TypeDistributionItem[];
  team_distribution?: TeamDistributionItem[];
  recently_updated_items: WorkItem[];
};

/**
 * Standard backend error JSON envelope.
 */
export type ApiError = {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
};

/**
 * Classification category for in-app alerts.
 */
export type NotificationType =
  | "ASSIGNMENT"
  | "STATUS_CHANGE"
  | "APPROVAL_REQUESTED"
  | "APPROVAL_DECISION"
  | "COMMENT"
  | "USER_APPROVAL"
  | "SYSTEM";

/**
 * In-app notification record.
 */
export type Notification = {
  id: number;
  user_id: number;
  title: string;
  message: string;
  type: NotificationType | string;
  link?: string | null;
  work_item_id?: number | null;
  is_read: boolean;
  read_at?: string | null;
  created_at: string;
};

/**
 * Paginated list response for user notifications.
 */
export type NotificationListResponse = {
  items: Notification[];
  total: number;
  unread_count: number;
  page: number;
  page_size: number;
};

/**
 * Unread notification count badge response.
 */
export type UnreadCountResponse = {
  unread_count: number;
};

