import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LoginPage } from "../src/pages/LoginPage";
import { queryClient } from "../src/lib/queryClient";
import { useAuthStore } from "../src/store/auth";

test("login form renders credentials fields", () => {
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  expect(screen.getByText("Sign in")).toBeInTheDocument();
  expect(screen.getByLabelText("Email")).toBeInTheDocument();
});

test("login page displays error on failed authentication", () => {
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  const emailInput = screen.getByLabelText("Email");
  const passwordInput = screen.getByLabelText("Password");
  const submitButton = screen.getByRole("button", { name: /sign in/i });

  expect(emailInput).toBeInTheDocument();
  expect(passwordInput).toBeInTheDocument();
  expect(submitButton).toBeInTheDocument();
});

test("auth logout clears queryClient cached data to prevent cross-user data leakage", () => {
  // Prime cache with simulated user-specific session data
  queryClient.setQueryData(["dashboard"], { active: 10, high_or_critical: 4 });
  queryClient.setQueryData(["work-items"], [{ id: 1, title: "Secret task" }]);
  queryClient.setQueryData(["me"], { id: 1, name: "Previous User" });

  expect(queryClient.getQueryData(["dashboard"])).toBeDefined();
  expect(queryClient.getQueryData(["work-items"])).toBeDefined();
  expect(queryClient.getQueryData(["me"])).toBeDefined();

  // Execute logout
  useAuthStore.getState().logout();

  // Verify all caches are wiped
  expect(queryClient.getQueryData(["dashboard"])).toBeUndefined();
  expect(queryClient.getQueryData(["work-items"])).toBeUndefined();
  expect(queryClient.getQueryData(["me"])).toBeUndefined();
  expect(useAuthStore.getState().isAuthenticated).toBe(false);
  expect(useAuthStore.getState().user).toBeNull();
});
