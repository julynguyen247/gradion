export type PipelineFailureKind =
  | "GENERATION_LIMIT"
  | "PROVIDER_AUTH"
  | "PROVIDER_UNAVAILABLE"
  | "GENERATION_TIMEOUT"
  | "GENERATION_FAILED";

export interface SafePipelineFailure {
  kind: PipelineFailureKind;
  message: string;
}

export const PIPELINE_FAILURE_MESSAGES = {
  generationLimit: "Generation limit reached. Please try again later.",
  providerUnavailable: "Generation is temporarily unavailable. Please try again later.",
  generationTimeout: "Generation timed out. Please try again.",
  generationFailed: "Generation failed. Please try again.",
} as const;

export const PIPELINE_INTERRUPTED_MESSAGE =
  "The server stopped while this step was running. Retry when ready.";

const SAFE_PERSISTED_MESSAGES = new Set<string>([
  ...Object.values(PIPELINE_FAILURE_MESSAGES),
  PIPELINE_INTERRUPTED_MESSAGE,
]);

const RATE_LIMIT_PATTERN = /(?:\b429\b|quota|rate[\s_-]*limit|resource[\s_-]*exhausted|too many requests)/i;
const TIMEOUT_PATTERN = /(?:time[\s_-]*out|timed out|deadline[\s_-]*exceeded|aborterror)/i;

/**
 * Reduces SDK/provider failures to an allow-listed message before they cross a
 * persistence or HTTP boundary. The kind is intentionally kept separate so
 * server-side diagnostics do not need to depend on provider wording.
 */
export function toSafePipelineFailure(error: unknown): SafePipelineFailure {
  const status = findStatus(error);
  const detail = collectDetails(error);

  if (status === 429 || RATE_LIMIT_PATTERN.test(detail)) {
    return {
      kind: "GENERATION_LIMIT",
      message: PIPELINE_FAILURE_MESSAGES.generationLimit,
    };
  }

  if (status === 401 || status === 403) {
    return {
      kind: "PROVIDER_AUTH",
      message: PIPELINE_FAILURE_MESSAGES.providerUnavailable,
    };
  }

  if (status === 408 || status === 504 || TIMEOUT_PATTERN.test(detail)) {
    return {
      kind: "GENERATION_TIMEOUT",
      message: PIPELINE_FAILURE_MESSAGES.generationTimeout,
    };
  }

  if (status !== null && status >= 500) {
    return {
      kind: "PROVIDER_UNAVAILABLE",
      message: PIPELINE_FAILURE_MESSAGES.providerUnavailable,
    };
  }

  return {
    kind: "GENERATION_FAILED",
    message: PIPELINE_FAILURE_MESSAGES.generationFailed,
  };
}

/** Scrubs failures written by older app versions before returning them. */
export function sanitizePersistedPipelineError(message: string): string {
  if (SAFE_PERSISTED_MESSAGES.has(message)) return message;
  return toSafePipelineFailure(new Error(message)).message;
}

function findStatus(value: unknown, depth = 0): number | null {
  if (!isRecord(value) || depth > 2) return null;

  for (const key of ["status", "statusCode"]) {
    const candidate = value[key];
    if (typeof candidate === "number" && Number.isInteger(candidate)) return candidate;
    if (typeof candidate === "string" && /^\d{3}$/.test(candidate)) return Number(candidate);
  }

  for (const key of ["cause", "response", "error"]) {
    const nestedStatus = findStatus(value[key], depth + 1);
    if (nestedStatus !== null) return nestedStatus;
  }

  return null;
}

function collectDetails(value: unknown, depth = 0, seen = new Set<unknown>()): string {
  if (depth > 2 || value === null || value === undefined || seen.has(value)) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (!isRecord(value)) return "";

  seen.add(value);
  return ["name", "message", "code", "status", "statusCode", "cause", "response", "error"]
    .map((key) => collectDetails(value[key], depth + 1, seen))
    .filter(Boolean)
    .join(" ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (typeof value === "object" && value !== null) || typeof value === "function";
}
