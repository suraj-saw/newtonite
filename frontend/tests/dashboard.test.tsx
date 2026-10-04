import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, test } from "vitest";
import { StatusDonutChart } from "../src/components/dashboard/StatusDonutChart";
import { PriorityBarChart } from "../src/components/dashboard/PriorityBarChart";
import { TypeDistributionChart } from "../src/components/dashboard/TypeDistributionChart";
import { TeamWorkloadChart } from "../src/components/dashboard/TeamWorkloadChart";
import { OperationalHealthMetrics } from "../src/components/dashboard/OperationalHealthMetrics";

test("StatusDonutChart renders status elements and legend", () => {
  const data = [
    { status: "OPEN", count: 5 },
    { status: "IN_PROGRESS", count: 3 },
    { status: "RESOLVED", count: 2 },
  ];
  render(
    <MemoryRouter>
      <StatusDonutChart data={data} total={10} />
    </MemoryRouter>,
  );

  expect(screen.getByText("Work Items by Status")).toBeInTheDocument();
  expect(screen.getByText("10 total")).toBeInTheDocument();
  expect(screen.getByText("Open")).toBeInTheDocument();
  expect(screen.getByText("In progress")).toBeInTheDocument();
  expect(screen.getByText("Resolved")).toBeInTheDocument();
});

test("PriorityBarChart renders priority distribution bars", () => {
  const data = [
    { priority: "CRITICAL", count: 1 },
    { priority: "HIGH", count: 4 },
    { priority: "MEDIUM", count: 8 },
    { priority: "LOW", count: 2 },
  ];
  render(
    <MemoryRouter>
      <PriorityBarChart data={data} total={15} />
    </MemoryRouter>,
  );

  expect(screen.getByText("Priority Distribution")).toBeInTheDocument();
  expect(screen.getByText("Critical")).toBeInTheDocument();
  expect(screen.getByText("High")).toBeInTheDocument();
  expect(screen.getByText("5 Urgent")).toBeInTheDocument();
});

test("TypeDistributionChart renders categorical items", () => {
  const data = [
    { type: "CUSTOMER_ISSUE", count: 4 },
    { type: "ENGINEERING", count: 6 },
    { type: "PAYMENT", count: 2 },
  ];
  render(
    <MemoryRouter>
      <TypeDistributionChart data={data} total={12} />
    </MemoryRouter>,
  );

  expect(screen.getByText("Work Items by Category")).toBeInTheDocument();
  expect(screen.getByText("Customer issue")).toBeInTheDocument();
  expect(screen.getByText("Engineering")).toBeInTheDocument();
});

test("TeamWorkloadChart renders comparative team throughput", () => {
  const data = [
    { team_id: 1, team_name: "Engineering", total: 10, active: 7, resolved: 3 },
    { team_id: 2, team_name: "Operations", total: 6, active: 4, resolved: 2 },
  ];
  render(
    <MemoryRouter>
      <TeamWorkloadChart data={data} totalActive={11} />
    </MemoryRouter>,
  );

  expect(screen.getByText("Team Workload & Throughput")).toBeInTheDocument();
  expect(screen.getByText("Engineering")).toBeInTheDocument();
  expect(screen.getByText("Operations")).toBeInTheDocument();
  expect(screen.getByText("7 active")).toBeInTheDocument();
});

test("OperationalHealthMetrics renders resolution and health metrics", () => {
  const summary = {
    active: 8,
    high_or_critical: 3,
    assigned_to_me: 2,
    overdue: 1,
    blocked: 1,
    recently_updated: 4,
    unassigned: 2,
    total_items: 20,
    status_distribution: [
      { status: "RESOLVED", count: 10 },
      { status: "CLOSED", count: 2 },
    ],
    recently_updated_items: [],
  };
  render(<OperationalHealthMetrics summary={summary} />);

  expect(screen.getByText("Resolution Rate")).toBeInTheDocument();
  expect(screen.getByText("60%")).toBeInTheDocument();
  expect(screen.getByText("Blocked Workload")).toBeInTheDocument();
  expect(screen.getByText("Overdue Risk")).toBeInTheDocument();
  expect(screen.getByText("Assignment Coverage")).toBeInTheDocument();
});
