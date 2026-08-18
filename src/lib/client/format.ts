import type { PipelineStep, ProjectSummary } from "./types";

export const PIPELINE_STEPS: ReadonlyArray<{
  key: PipelineStep;
  label: string;
  verb: string;
  runningLabel: string;
  description: string;
}> = [
  {
    key: "STYLE",
    label: "Style",
    verb: "Create style",
    runningLabel: "Reading your book and defining its visual language",
    description: "Set one visual direction for every image that follows.",
  },
  {
    key: "CHARACTERS",
    label: "Characters",
    verb: "Find characters",
    runningLabel: "Finding the main adult characters in your book",
    description: "Identify up to two main adult characters and describe them.",
  },
  {
    key: "PORTRAITS",
    label: "Portraits",
    verb: "Create portraits",
    runningLabel: "Illustrating your character portraits one by one",
    description: "Create a consistent portrait for each character.",
  },
  {
    key: "CHAPTERS",
    label: "Chapter",
    verb: "Plan chapter",
    runningLabel: "Composing the chapter illustration prompt",
    description: "Choose one chapter scene and write its image prompt.",
  },
  {
    key: "ILLUSTRATIONS",
    label: "Illustration",
    verb: "Create illustration",
    runningLabel: "Painting your final chapter illustration",
    description: "Render the scene while keeping every character consistent.",
  },
];

export function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function projectStatusLabel(status: ProjectSummary["status"]) {
  if (status === "IN_PROGRESS") return "In progress";
  if (status === "DONE") return "Done";
  return "Draft";
}

export function projectSummaryText(project: ProjectSummary) {
  if (project.status === "DONE") return "All five steps complete";
  if (project.stepState === "RUNNING" && project.activeStep) {
    return `${PIPELINE_STEPS.find((step) => step.key === project.activeStep)?.label ?? "Step"} is running`;
  }
  if (project.completedStep === 0) return "Ready to create a visual style";
  return `${project.completedStep} of 5 steps complete`;
}

export function currentStepFor(completedStep: number) {
  return PIPELINE_STEPS[Math.min(Math.max(completedStep, 0), 5)];
}
