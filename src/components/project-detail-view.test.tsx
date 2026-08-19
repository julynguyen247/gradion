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
    expect(screen.getAllByTestId("art-generation-animation")).toHaveLength(2);
  });

  it("keeps the painting animation focused on image-generation steps", () => {
    renderState({ ...baseProject, status: "IN_PROGRESS", activeStep: "CHARACTERS", stepState: "RUNNING", stepStartedAt: "2026-08-12T00:10:00.000Z" });
    expect(screen.getByRole("heading", { name: /finding the main adult characters/i })).toBeInTheDocument();
    expect(screen.queryByTestId("art-generation-animation")).not.toBeInTheDocument();
  });

  it("offers retry for a failed step without hiding the error", () => {
    const { onRunStep } = renderState({ ...baseProject, status: "IN_PROGRESS", completedStep: 1, activeStep: "CHARACTERS", stepState: "FAILED", lastError: "Gemini returned an invalid character list." });
    expect(screen.getByText("Gemini returned an invalid character list.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(onRunStep).toHaveBeenCalledWith("CHARACTERS");
  });

  it("replaces raw quota details with a concise retry state", () => {
    const rawQuotaError = "429 You exceeded your current quota, please check your plan and billing details. Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 0, model: gemini-3.1-flash-image https://ai.google.dev/gemini-api/docs/rate-limits";
    const { onRunStep } = renderState({
      ...baseProject,
      status: "IN_PROGRESS",
      completedStep: 2,
      activeStep: "PORTRAITS",
      stepState: "FAILED",
      lastError: rawQuotaError,
    });

    expect(screen.getByRole("heading", { name: "Generation limit reached." })).toBeInTheDocument();
    expect(screen.getByText("Please try again later.")).toBeInTheDocument();
    expect(screen.queryByText(/generativelanguage\.googleapis\.com/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/rate-limits/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(onRunStep).toHaveBeenCalledWith("PORTRAITS");
  });

  it("recognizes the backend's safe generation-limit message", () => {
    renderState({
      ...baseProject,
      status: "IN_PROGRESS",
      completedStep: 4,
      activeStep: "ILLUSTRATIONS",
      stepState: "FAILED",
      lastError: "Generation limit reached. Please try again later.",
    });

    expect(screen.getByText("Usage limit reached")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Generation limit reached." })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("also sanitizes a quota error returned before persisted state refreshes", () => {
    render(<ProjectDetailView project={baseProject} actionError="RESOURCE_EXHAUSTED: quota exceeded for metric generate_content_free_tier_requests" onRunStep={vi.fn()} onRecover={vi.fn()} />);

    expect(screen.getByRole("alert")).toHaveTextContent("Generation limit reached. Please try again later.");
    expect(screen.getByRole("alert")).not.toHaveTextContent("generate_content_free_tier_requests");
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
