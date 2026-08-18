import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProjectList } from "./project-list";
import type { ProjectSummary } from "@/lib/client/types";

const projects: ProjectSummary[] = [
  { id: "draft", title: "A Draft Story", createdAt: "2026-08-10T00:00:00.000Z", status: "DRAFT", completedStep: 0, activeStep: null, stepState: "IDLE" },
  { id: "running", title: "A Story in Motion", createdAt: "2026-08-11T00:00:00.000Z", status: "IN_PROGRESS", completedStep: 2, activeStep: "PORTRAITS", stepState: "RUNNING" },
  { id: "done", title: "A Finished Story", createdAt: "2026-08-12T00:00:00.000Z", status: "DONE", completedStep: 5, activeStep: null, stepState: "IDLE" },
];

describe("ProjectList", () => {
  it("shows an inviting empty state", () => {
    render(<ProjectList projects={[]} />);
    expect(screen.getByRole("heading", { name: "Your first story starts here" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /create a project/i })).toHaveAttribute("href", "/projects/new");
  });

  it("shows draft, running, and completed projects with progress", () => {
    render(<ProjectList projects={projects} />);
    expect(screen.getByText("Draft")).toBeInTheDocument();
    expect(screen.getByText("In progress")).toBeInTheDocument();
    expect(screen.getByText("Done")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /portraits is running/i })).toBeInTheDocument();
    expect(screen.getByLabelText("2 of 5 steps complete")).toBeInTheDocument();
    expect(screen.getByLabelText("5 of 5 steps complete")).toBeInTheDocument();
  });
});
