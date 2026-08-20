import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SessionStore } from "./auth";
import { createDatabase, type SqliteDatabase } from "./database";
import { ProjectFiles } from "./files";
import { FakeGeminiGateway, type FakeGatewayOptions } from "./gemini/fake";
import { PipelineService } from "./pipeline";
import { PIPELINE_FAILURE_MESSAGES } from "./pipeline-errors";
import { ProjectStore } from "./projects";
import type { Step } from "./types";

interface Harness {
  database: SqliteDatabase;
  directory: string;
  files: ProjectFiles;
  projects: ProjectStore;
  sessions: SessionStore;
  gateway: FakeGeminiGateway;
  pipeline: PipelineService;
  userId: string;
  projectId: string;
}

const harnesses: Harness[] = [];

async function createHarness(options: FakeGatewayOptions = {}, staleAfterMs = 60_000): Promise<Harness> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "gradion-backend-test-"));
  const database = createDatabase(path.join(directory, "test.db"));
  const files = new ProjectFiles(path.join(directory, "files"));
  const projects = new ProjectStore(database, files, staleAfterMs);
  const sessions = new SessionStore(database, 60_000);
  const gateway = new FakeGeminiGateway(options);
  const pipeline = new PipelineService(projects, files, gateway, staleAfterMs);
  const { user } = sessions.createIdentity("Reader One", "reader@example.com");
  const project = await projects.create(user.id, "The Wind in the Willows", "A sufficiently long book text.");
  const harness = {
    database,
    directory,
    files,
    projects,
    sessions,
    gateway,
    pipeline,
    userId: user.id,
    projectId: project.id,
  };
  harnesses.push(harness);
  return harness;
}

async function runSteps(harness: Harness, steps: Step[]): Promise<void> {
  for (const step of steps) {
    const result = await harness.pipeline.runStep(harness.userId, harness.projectId, step);
    expect(result.project.stepState).toBe("IDLE");
  }
}

afterEach(async () => {
  while (harnesses.length) {
    const harness = harnesses.pop();
    if (!harness) continue;
    harness.database.close();
    await fs.rm(harness.directory, { recursive: true, force: true });
  }
});

describe("pipeline ordering and execution claims", () => {
  it("rejects a step before its predecessor succeeds", async () => {
    const harness = await createHarness();

    await expect(
      harness.pipeline.runStep(harness.userId, harness.projectId, "CHARACTERS"),
    ).rejects.toMatchObject({ code: "STEP_OUT_OF_ORDER", status: 409 });
    expect(harness.gateway.calls.generateCharacters).toBe(0);
  });

  it("allows only one caller to own a running Gemini step", async () => {
    let releaseStyle!: () => void;
    const waitForStyle = new Promise<void>((resolve) => {
      releaseStyle = resolve;
    });
    const harness = await createHarness({ waitForStyle });

    const first = harness.pipeline.runStep(harness.userId, harness.projectId, "STYLE");
    const duplicate = await harness.pipeline.runStep(harness.userId, harness.projectId, "STYLE");

    expect(duplicate.alreadyRunning).toBe(true);
    expect(duplicate.project.activeStep).toBe("STYLE");
    expect(duplicate.project.stepState).toBe("RUNNING");
    releaseStyle();
    const completed = await first;
    expect(completed.project.completedStep).toBe(1);
    expect(harness.gateway.calls.generateStyle).toBe(1);
  });

  it("shares the atomic claim across independent SQLite connections", async () => {
    let releaseStyle!: () => void;
    const waitForStyle = new Promise<void>((resolve) => {
      releaseStyle = resolve;
    });
    const harness = await createHarness({ waitForStyle });
    const secondDatabase = createDatabase(path.join(harness.directory, "test.db"));
    const secondFiles = new ProjectFiles(path.join(harness.directory, "files"));
    const secondProjects = new ProjectStore(secondDatabase, secondFiles, 60_000);
    const secondGateway = new FakeGeminiGateway();
    const secondPipeline = new PipelineService(
      secondProjects,
      secondFiles,
      secondGateway,
      60_000,
    );

    try {
      const first = harness.pipeline.runStep(harness.userId, harness.projectId, "STYLE");
      const duplicate = await secondPipeline.runStep(
        harness.userId,
        harness.projectId,
        "STYLE",
      );

      expect(duplicate.alreadyRunning).toBe(true);
      expect(duplicate.project.stepState).toBe("RUNNING");
      expect(secondGateway.calls.uploadBook).toBe(0);
      expect(secondGateway.calls.startBook).toBe(0);
      expect(secondGateway.calls.generateStyle).toBe(0);

      releaseStyle();
      await first;
    } finally {
      releaseStyle();
      secondDatabase.close();
    }
  });
});

describe("failure, retry, and stale recovery", () => {
  it("preserves a user-supplied style when its provider call must be retried", async () => {
    const harness = await createHarness({ failMethod: "generateStyle", failAtCall: 1 });

    const failed = await harness.pipeline.runStep(
      harness.userId,
      harness.projectId,
      "STYLE",
      { style: "Luminous cut-paper collage" },
    );
    expect(failed.project).toMatchObject({
      completedStep: 0,
      stepState: "FAILED",
      style: "Luminous cut-paper collage",
    });

    const retried = await harness.pipeline.runStep(harness.userId, harness.projectId, "STYLE");
    expect(retried.project).toMatchObject({
      completedStep: 1,
      stepState: "IDLE",
      style: "Luminous cut-paper collage",
    });
    expect(harness.gateway.calls.uploadBook).toBe(1);
    expect(harness.gateway.calls.startBook).toBe(1);
    expect(harness.gateway.calls.generateStyle).toBe(2);
  });

  it("preserves completed steps and retries only the failed step", async () => {
    const harness = await createHarness({ failMethod: "generateCharacters", failAtCall: 1 });
    await runSteps(harness, ["STYLE"]);

    const failed = await harness.pipeline.runStep(harness.userId, harness.projectId, "CHARACTERS");
    expect(failed.project).toMatchObject({
      completedStep: 1,
      activeStep: "CHARACTERS",
      stepState: "FAILED",
    });
    expect(failed.project.lastError).toBe(PIPELINE_FAILURE_MESSAGES.generationFailed);

    const retried = await harness.pipeline.runStep(harness.userId, harness.projectId, "CHARACTERS");
    expect(retried.project).toMatchObject({ completedStep: 2, activeStep: null, stepState: "IDLE" });
    expect(harness.gateway.calls.generateStyle).toBe(1);
    expect(harness.gateway.calls.generateCharacters).toBe(2);
  });

  it("recovers only an explicitly stale claim and never starts a retry", async () => {
    const harness = await createHarness({}, 1_000);
    harness.database
      .prepare(
        "UPDATE projects SET active_step = 'STYLE', step_state = 'RUNNING', step_started_at = ? WHERE id = ?",
      )
      .run(Date.now() - 2_000, harness.projectId);

    const recovered = await harness.pipeline.recover(harness.userId, harness.projectId);
    expect(recovered).toMatchObject({ activeStep: "STYLE", stepState: "FAILED", canRecover: false });
    expect(harness.gateway.calls.generateStyle).toBe(0);

    const retried = await harness.pipeline.runStep(harness.userId, harness.projectId, "STYLE");
    expect(retried.project.completedStep).toBe(1);
    expect(harness.gateway.calls.generateStyle).toBe(1);
  });

  it("persists and returns only a safe message for a provider quota failure", async () => {
    const providerMessage =
      "429 You exceeded your current quota. See https://ai.google.dev/gemini-api/docs/rate-limits";
    const providerError = Object.assign(new Error(providerMessage), { status: 429 });
    const harness = await createHarness({
      failMethod: "generateStyle",
      failAtCall: 1,
      failError: providerError,
    });

    const failed = await harness.pipeline.runStep(harness.userId, harness.projectId, "STYLE");
    const stored = harness.database
      .prepare("SELECT last_error FROM projects WHERE id = ?")
      .get(harness.projectId) as { last_error: string };

    expect(failed.project.lastError).toBe(PIPELINE_FAILURE_MESSAGES.generationLimit);
    expect(stored.last_error).toBe(PIPELINE_FAILURE_MESSAGES.generationLimit);
    expect(JSON.stringify(failed.project)).not.toContain("ai.google.dev");
    expect(stored.last_error).not.toContain("quota");

    const retried = await harness.pipeline.runStep(harness.userId, harness.projectId, "STYLE");
    expect(retried.project).toMatchObject({ completedStep: 1, stepState: "IDLE", lastError: null });
    expect(harness.gateway.calls.generateStyle).toBe(2);
  });

  it("scrubs a legacy raw quota failure before returning project detail", async () => {
    const harness = await createHarness();
    const legacyMessage =
      "429 quota exceeded. More details: https://ai.google.dev/gemini-api/docs/rate-limits";
    harness.database
      .prepare("UPDATE projects SET active_step = 'STYLE', step_state = 'FAILED', last_error = ? WHERE id = ?")
      .run(legacyMessage, harness.projectId);

    const project = await harness.projects.getDetail(harness.userId, harness.projectId);
    const stored = harness.database
      .prepare("SELECT last_error FROM projects WHERE id = ?")
      .get(harness.projectId) as { last_error: string };

    expect(project.lastError).toBe(PIPELINE_FAILURE_MESSAGES.generationLimit);
    expect(stored.last_error).toBe(PIPELINE_FAILURE_MESSAGES.generationLimit);
    expect(JSON.stringify(project)).not.toContain("ai.google.dev");
  });

  it("refuses recovery while a claim is still fresh", async () => {
    const harness = await createHarness({}, 60_000);
    harness.database
      .prepare(
        "UPDATE projects SET active_step = 'STYLE', step_state = 'RUNNING', step_started_at = ? WHERE id = ?",
      )
      .run(Date.now(), harness.projectId);

    await expect(harness.pipeline.recover(harness.userId, harness.projectId)).rejects.toMatchObject({
      code: "STEP_NOT_STALE",
    });
  });
});

describe("bounded, checkpointed generation", () => {
  it("finalizes persisted text checkpoints without repeating Gemini calls", async () => {
    const harness = await createHarness();
    await runSteps(harness, ["STYLE", "CHARACTERS"]);
    const before = await harness.projects.getDetail(harness.userId, harness.projectId);

    harness.database
      .prepare(
        `UPDATE projects
         SET completed_step = 1, active_step = 'CHARACTERS', step_state = 'FAILED',
             step_started_at = NULL, last_error = ?
         WHERE id = ?`,
      )
      .run(PIPELINE_FAILURE_MESSAGES.generationFailed, harness.projectId);

    const resumed = await harness.pipeline.runStep(
      harness.userId,
      harness.projectId,
      "CHARACTERS",
    );
    expect(resumed.project).toMatchObject({ completedStep: 2, stepState: "IDLE" });
    expect(resumed.project.characters.map(({ id }) => id)).toEqual(
      before.characters.map(({ id }) => id),
    );
    expect(harness.gateway.calls.generateCharacters).toBe(1);
  });

  it("hard-caps model output to two adult characters and one chapter", async () => {
    const harness = await createHarness({
      characters: [
        { name: "Adult One", prompt: "One" },
        { name: "Adult Two", prompt: "Two" },
        { name: "Adult Three", prompt: "Three" },
      ],
      chapters: [
        { name: "Chapter One", prompt: "One" },
        { name: "Chapter Two", prompt: "Two" },
      ],
    });

    await runSteps(harness, ["STYLE", "CHARACTERS", "PORTRAITS", "CHAPTERS"]);
    const project = await harness.projects.getDetail(harness.userId, harness.projectId);
    expect(project.characters).toHaveLength(2);
    expect(project.chapters).toHaveLength(1);
    expect(harness.gateway.calls.generatePortrait).toBe(2);
  });

  it("checkpoints portrait one and resumes at portrait two after failure", async () => {
    const harness = await createHarness({ failMethod: "generatePortrait", failAtCall: 2 });
    await runSteps(harness, ["STYLE", "CHARACTERS"]);

    const failed = await harness.pipeline.runStep(harness.userId, harness.projectId, "PORTRAITS");
    expect(failed.project.stepState).toBe("FAILED");
    expect(failed.project.characters.map((character) => character.state)).toEqual(["DONE", "FAILED"]);
    const firstPortraitUrl = failed.project.characters[0].portraitUrl;

    const resumed = await harness.pipeline.runStep(harness.userId, harness.projectId, "PORTRAITS");
    expect(resumed.project.completedStep).toBe(3);
    expect(resumed.project.characters.map((character) => character.state)).toEqual(["DONE", "DONE"]);
    expect(resumed.project.characters[0].portraitUrl).toBe(firstPortraitUrl);
    expect(harness.gateway.calls.generatePortrait).toBe(3);
  });

  it("runs all five steps and reloads durable media-backed results", async () => {
    const harness = await createHarness();
    await runSteps(harness, ["STYLE", "CHARACTERS", "PORTRAITS", "CHAPTERS", "ILLUSTRATIONS"]);

    const reloaded = await harness.projects.getDetail(harness.userId, harness.projectId);
    expect(reloaded).toMatchObject({ completedStep: 5, status: "DONE", stepState: "IDLE" });
    expect(reloaded.characters.every((character) => character.portraitUrl)).toBe(true);
    expect(reloaded.chapters[0].illustrationUrl).toBeTruthy();
    expect(harness.gateway.calls.uploadBook).toBe(1);
    expect(harness.gateway.calls.startBook).toBe(1);
  });
});

describe("ownership", () => {
  it("does not expose another user's project, book, or generated media", async () => {
    const harness = await createHarness();
    await runSteps(harness, ["STYLE", "CHARACTERS", "PORTRAITS"]);
    const other = harness.sessions.createIdentity("Reader Two", "other@example.com").user;
    const ownerProject = await harness.projects.getDetail(harness.userId, harness.projectId);
    const assetId = ownerProject.characters[0].id;

    expect(() => harness.projects.getOwnedRow(other.id, harness.projectId)).toThrowError(
      expect.objectContaining({ code: "PROJECT_NOT_FOUND" }),
    );
    await expect(harness.projects.getDetail(other.id, harness.projectId)).rejects.toMatchObject({
      code: "PROJECT_NOT_FOUND",
    });
    expect(() => harness.projects.getAsset(other.id, harness.projectId, assetId)).toThrowError(
      expect.objectContaining({ code: "PROJECT_NOT_FOUND" }),
    );
  });
});
