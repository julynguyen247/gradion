import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProjectDetailView } from "./project-detail-view";
import type { ProjectDetail } from "@/lib/client/types";

const baseProject: ProjectDetail = {
  id: "project-1",
  title: "The River Story",
  createdAt: "2026-08-12T00:00:00.000Z",
  status: "DRAFT",
  completedStep: 0,
  activeStep: null,
  stepState: "IDLE",
  bookText: "A long and winding river ran past the old willow tree.",
  style: null,
  stepStartedAt: null,
  lastError: null,
  canRecover: false,
  characters: [],
  chapters: [],
};

function renderState(project: ProjectDetail, onRunStep = vi.fn(), onRecover = vi.fn()) {
  render(<ProjectDetailView project={project} onRunStep={onRunStep} onRecover={onRecover} />);
  return { onRunStep, onRecover };
}

describe("ProjectDetailView", () => {
  it("renders the ready action and passes an optional style", () => {
    const { onRunStep } = renderState(baseProject);
    fireEvent.change(screen.getByLabelText(/art direction/i), { target: { value: "Soft paper collage" } });
    fireEvent.click(screen.getByRole("button", { name: /create style/i }));
    expect(onRunStep).toHaveBeenCalledWith("STYLE", "Soft paper collage");
    expect(screen.getByText("Up next · Step 1")).toBeInTheDocument();
  });

  it("names the running step and preserves mixed portrait progress", () => {
    renderState({
      ...baseProject,
      status: "IN_PROGRESS",
      completedStep: 2,
      activeStep: "PORTRAITS",
      stepState: "RUNNING",
      style: "Warm ink and watercolour",
      stepStartedAt: "2026-08-12T00:10:00.000Z",
      characters: [
        { id: "c1", name: "Mole", prompt: "A kind mole in a velvet coat", state: "DONE", portraitUrl: "/api/projects/project-1/media/portrait-1" },
        { id: "c2", name: "Rat", prompt: "A river rat in a linen jacket", state: "RUNNING", portraitUrl: null },
      ],
    });
    expect(screen.getByRole("heading", { name: /illustrating your character portraits/i })).toBeInTheDocument();
    expect(screen.getByAltText("Portrait for Mole")).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Generating character for Rat" })).toBeInTheDocument();
  });

  it("offers retry for a failed step without hiding the error", () => {
    const { onRunStep } = renderState({ ...baseProject, status: "IN_PROGRESS", completedStep: 1, activeStep: "CHARACTERS", stepState: "FAILED", lastError: "Gemini returned an invalid character list." });
    expect(screen.getByText("Gemini returned an invalid character list.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /retry characters/i }));
    expect(onRunStep).toHaveBeenCalledWith("CHARACTERS");
  });

  it("offers recovery for a stale running step", () => {
    const { onRecover } = renderState({ ...baseProject, status: "IN_PROGRESS", completedStep: 3, activeStep: "CHAPTERS", stepState: "RUNNING", canRecover: true, stepStartedAt: "2026-08-12T00:00:00.000Z" });
    expect(screen.getByRole("heading", { name: /chapter has been running too long/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /recover this step/i }));
    expect(onRecover).toHaveBeenCalledOnce();
  });

  it("renders a stable complete state with no generation action", () => {
    renderState({ ...baseProject, status: "DONE", completedStep: 5, stepState: "IDLE", style: "Warm ink and watercolour" });
    expect(screen.getByRole("heading", { name: "Your illustrated story is ready." })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /create|retry|recover/i })).not.toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.tagName === "P" && element.textContent?.includes("5 of 5 steps complete") === true)).toBeInTheDocument();
  });
});
