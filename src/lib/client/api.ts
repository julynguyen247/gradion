import type {
  ApiErrorBody,
  PipelineStep,
  ProjectDetail,
  ProjectSummary,
  User,
} from "./types";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, {
    cache: "no-store",
    credentials: "same-origin",
    ...init,
  });

  if (!response.ok) {
    let body: ApiErrorBody | undefined;
    try {
      body = (await response.json()) as ApiErrorBody;
    } catch {
      // The fallback below is intentionally user-safe for malformed responses.
    }
    throw new ApiError(
      body?.error?.message ?? "Something went wrong. Please try again.",
      response.status,
      body?.error?.code,
    );
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  getSession(signal?: AbortSignal) {
    return request<{ user: User | null }>("/api/session", { signal });
  },

  createSession(payload: { name: string; email: string }) {
    return request<{ user: User }>("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  },

  deleteSession() {
    return request<void>("/api/session", { method: "DELETE" });
  },

  listProjects(signal?: AbortSignal) {
    return request<{ projects: ProjectSummary[] }>("/api/projects", { signal });
  },

  createProject(formData: FormData) {
    return request<{ project: ProjectDetail }>("/api/projects", {
      method: "POST",
      body: formData,
    });
  },

  getProject(id: string, signal?: AbortSignal) {
    return request<{ project: ProjectDetail }>(
      `/api/projects/${encodeURIComponent(id)}`,
      { signal },
    );
  },

  runStep(id: string, step: PipelineStep, style?: string) {
    const slug = step.toLowerCase();
    const hasStyle = step === "STYLE" && Boolean(style?.trim());
    return request<{ project: ProjectDetail; alreadyRunning?: boolean }>(
      `/api/projects/${encodeURIComponent(id)}/steps/${slug}`,
      {
        method: "POST",
        ...(hasStyle
          ? {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ style: style?.trim() }),
            }
          : {}),
      },
    );
  },

  recoverProject(id: string) {
    return request<{ project: ProjectDetail }>(
      `/api/projects/${encodeURIComponent(id)}/recover`,
      { method: "POST" },
    );
  },
};
