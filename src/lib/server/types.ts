export const STEPS = [
  "STYLE",
  "CHARACTERS",
  "PORTRAITS",
  "CHAPTERS",
  "ILLUSTRATIONS",
] as const;

export type Step = (typeof STEPS)[number];
export type StepSlug = Lowercase<Step>;
export type StepState = "IDLE" | "RUNNING" | "FAILED";
export type ItemState = "PENDING" | "RUNNING" | "DONE" | "FAILED";

export interface UserDTO {
  id: string;
  name: string;
  email: string;
}

export interface CharacterDTO {
  id: string;
  name: string;
  prompt: string;
  state: ItemState;
  portraitUrl: string | null;
}

export interface ChapterDTO {
  id: string;
  name: string;
  prompt: string;
  state: ItemState;
  illustrationUrl: string | null;
}

export interface ProjectSummaryDTO {
  id: string;
  title: string;
  createdAt: string;
  status: "DRAFT" | "IN_PROGRESS" | "DONE";
  completedStep: number;
  activeStep: Step | null;
  stepState: StepState;
}

export interface ProjectDetailDTO extends ProjectSummaryDTO {
  bookText: string;
  style: string | null;
  stepStartedAt: string | null;
  lastError: string | null;
  canRecover: boolean;
  characters: CharacterDTO[];
  chapters: ChapterDTO[];
}

export function stepNumber(step: Step): number {
  return STEPS.indexOf(step) + 1;
}

export function parseStepSlug(value: string): Step | null {
  const normalized = value.toUpperCase();
  return STEPS.find((step) => step === normalized) ?? null;
}
