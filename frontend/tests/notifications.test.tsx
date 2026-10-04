import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, test } from "vitest";
import { NotificationBell } from "../src/components/notifications/NotificationBell";
import { NotificationsPage } from "../src/pages/NotificationsPage";
import { formatRelativeTime } from "../src/lib/utils";

test("formatRelativeTime formats relative timestamps correctly", () => {
  const now = new Date();
  expect(formatRelativeTime(now.toISOString())).toBe("Just now");

  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  expect(formatRelativeTime(tenMinutesAgo)).toBe("10m ago");

  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  expect(formatRelativeTime(twoHoursAgo)).toBe("2h ago");

  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  expect(formatRelativeTime(threeDaysAgo)).toBe("3d ago");

  expect(formatRelativeTime(null)).toBe("—");
});

test("NotificationBell renders without crashing", () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  expect(screen.getByLabelText("Notifications")).toBeInTheDocument();
});

test("NotificationsPage renders search and filters", () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <NotificationsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  expect(screen.getByRole("heading", { name: "Notifications" })).toBeInTheDocument();
  expect(screen.getByPlaceholderText("Search notifications...")).toBeInTheDocument();
  expect(screen.getByText("All types")).toBeInTheDocument();
});
