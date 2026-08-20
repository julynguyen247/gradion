import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/client/api";
import type { ProjectDetail } from "@/lib/client/types";
import { ProjectDetailScreen } from "./project-detail-screen";

vi.mock("@/lib/client/api", () => ({
  api: {
    getProject: vi.fn(),
    runStep: vi.fn(),
    recoverProject: vi.fn(),
  },
}));

const project: ProjectDetail = {
  id: "project-1",
  title: "The River Story",
  createdAt: "2026-08-12T00:00:00.000Z",
  status: "IN_PROGRESS",
  completedStep: 2,
  activeStep: "PORTRAITS",
  stepState: "RUNNING",
  bookText: "A river ran past an old willow tree.",
  style: "Warm ink and watercolour",
  stepStartedAt: "2026-08-12T00:10:00.000Z",
  lastError: null,
  canRecover: false,
  characters: [],
  chapters: [],
};

const getProject = vi.mocked(api.getProject);

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ProjectDetailScreen", () => {
  it("shows a stable loading state while the project request is pending", () => {
    getProject.mockReturnValue(new Promise(() => {}));
    render(<ProjectDetailScreen projectId={project.id} />);

    expect(screen.getByRole("status", { name: "Loading page" })).toBeInTheDocument();
  });

  it("shows a route-level recovery path when the project cannot load", async () => {
    getProject.mockRejectedValue(new Error("The saved project could not be found."));
    render(<ProjectDetailScreen projectId={project.id} />);

    expect(await screen.findByRole("heading", { name: "Project unavailable" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("The saved project could not be found.");
    expect(screen.getByRole("link", { name: "Back to projects" })).toHaveAttribute("href", "/projects");
  });

  it("polls a persisted running step and stops as soon as the server returns idle", async () => {
    vi.useFakeTimers();
    getProject
      .mockResolvedValueOnce({ project })
      .mockResolvedValueOnce({
        project: { ...project, activeStep: null, stepState: "IDLE", stepStartedAt: null },
      });

    render(<ProjectDetailScreen projectId={project.id} />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByRole("heading", { name: /illustrating your character portraits/i })).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_800);
    });
    expect(getProject).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("heading", { name: "Portraits" })).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_600);
    });
    expect(getProject).toHaveBeenCalledTimes(2);
  });
});
