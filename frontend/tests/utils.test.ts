import { expect, test } from "vitest";
import { CONFLICT_MESSAGE, isOverdue } from "../src/lib/utils";

test("conflict message is explicit", () => {
  expect(CONFLICT_MESSAGE).toContain("modified by another user");
  expect(CONFLICT_MESSAGE).toContain("Refresh");
});

test("overdue detection ignores resolved items", () => {
  const past = new Date(Date.now() - 1000).toISOString();
  expect(isOverdue(past, "OPEN")).toBe(true);
  expect(isOverdue(past, "RESOLVED")).toBe(false);
});
