export type User = {
  id: string;
  name: string;
  email: string;
};

export type ProjectStatus = "DRAFT" | "IN_PROGRESS" | "DONE";
export type PipelineStep =
  | "STYLE"
  | "CHARACTERS"
  | "PORTRAITS"
  | "CHAPTERS"
  | "ILLUSTRATIONS";
export type StepState = "IDLE" | "RUNNING" | "FAILED";
export type ItemState = "PENDING" | "RUNNING" | "DONE" | "FAILED";

export type ProjectSummary = {
  id: string;
  title: string;
  createdAt: string;
  status: ProjectStatus;
  completedStep: number;
  activeStep: PipelineStep | null;
  stepState: StepState;
};

export type Character = {
  id: string;
  name: string;
  prompt: string;
  state: ItemState;
  portraitUrl: string | null;
};

export type Chapter = {
  id: string;
  name: string;
  prompt: string;
  state: ItemState;
  illustrationUrl: string | null;
};

export type ProjectDetail = ProjectSummary & {
  bookText: string;
  style: string | null;
  stepStartedAt: string | null;
  lastError: string | null;
  canRecover: boolean;
  characters: Character[];
  chapters: Chapter[];
};

export type ApiErrorBody = {
  error?: {
    code?: string;
    message?: string;
  };
};
