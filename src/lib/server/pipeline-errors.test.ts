import { describe, expect, it } from "vitest";
import {
  PIPELINE_FAILURE_MESSAGES,
  sanitizePersistedPipelineError,
  toSafePipelineFailure,
} from "./pipeline-errors";

describe("pipeline error sanitization", () => {
  it("classifies SDK-style 429 errors without retaining provider details", () => {
    const rawMessage =
      "429 You exceeded your current quota. See https://ai.google.dev/gemini-api/docs/rate-limits";
    const error = Object.assign(new Error(rawMessage), { status: 429 });

    const failure = toSafePipelineFailure(error);

    expect(failure).toEqual({
      kind: "GENERATION_LIMIT",
      message: PIPELINE_FAILURE_MESSAGES.generationLimit,
    });
    expect(JSON.stringify(failure)).not.toContain("ai.google.dev");
    expect(JSON.stringify(failure)).not.toContain("quota");
  });

  it("recognizes quota failures nested in a provider cause", () => {
    const failure = toSafePipelineFailure({
      cause: {
        code: "RESOURCE_EXHAUSTED",
        message: "Quota exceeded for generate_content_free_tier_requests",
      },
    });

    expect(failure.kind).toBe("GENERATION_LIMIT");
    expect(failure.message).toBe(PIPELINE_FAILURE_MESSAGES.generationLimit);
  });

  it("uses allow-listed text for other provider failures", () => {
    const rawMessage = "Provider request failed; inspect https://provider.example/internal?id=secret";

    const failure = toSafePipelineFailure(new Error(rawMessage));

    expect(failure).toEqual({
      kind: "GENERATION_FAILED",
      message: PIPELINE_FAILURE_MESSAGES.generationFailed,
    });
    expect(failure.message).not.toContain("provider.example");
  });

  it("sanitizes legacy persisted quota text and preserves allow-listed text", () => {
    const rawMessage = "RESOURCE_EXHAUSTED: quota exceeded. https://ai.dev/rate-limit";

    expect(sanitizePersistedPipelineError(rawMessage)).toBe(
      PIPELINE_FAILURE_MESSAGES.generationLimit,
    );
    expect(sanitizePersistedPipelineError(PIPELINE_FAILURE_MESSAGES.generationLimit)).toBe(
      PIPELINE_FAILURE_MESSAGES.generationLimit,
    );
  });
});
