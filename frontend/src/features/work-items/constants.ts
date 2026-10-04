export const WORK_ITEM_TYPES = [
  "CUSTOMER_ISSUE",
  "ENGINEERING",
  "PAYMENT",
  "INCIDENT",
  "COMPLIANCE",
  "OPERATIONAL",
] as const;

export const WORK_ITEM_STATUSES = [
  "OPEN",
  "IN_PROGRESS",
  "PENDING_APPROVAL",
  "BLOCKED",
  "RESOLVED",
  "CLOSED",
] as const;
export const WORK_ITEM_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
