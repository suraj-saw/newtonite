import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WorkItemListPage } from "../src/pages/WorkItemListPage";
import { useAuthStore } from "../src/store/auth";

test("work item list page renders search and filters", () => {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <WorkItemListPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  expect(screen.getByText("Work items")).toBeInTheDocument();
  expect(screen.getByPlaceholderText("Search title or description")).toBeInTheDocument();
  expect(screen.getByText("All items")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Unassigned" })).toBeInTheDocument();
});

test("work item list displays loading state initially", () => {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <WorkItemListPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  // Should show loading spinner
  const spinner = document.querySelector('[role="status"]') || document.querySelector('.animate-spin');
  expect(spinner).toBeInTheDocument();
});

test("work item list renders assigned to me filter when user is logged in", () => {
  useAuthStore.getState().setUser({
    id: 9,
    name: "Morgan Member",
    email: "member@newtonite.local",
    is_active: true,
    is_admin: false,
    status: "APPROVED",
    created_at: new Date().toISOString(),
  });
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <WorkItemListPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  expect(screen.getByText("Assigned to me")).toBeInTheDocument();
  expect(screen.getByText("(Morgan Member)")).toBeInTheDocument();
});
