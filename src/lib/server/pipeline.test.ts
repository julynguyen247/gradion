import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SessionStore } from "./auth";
import { createDatabase, type SqliteDatabase } from "./database";
import { ProjectFiles } from "./files";
import { FakeGeminiGateway, type FakeGatewayOptions } from "./gemini/fake";
import { PipelineService } from "./pipeline";
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
});

describe("failure, retry, and stale recovery", () => {
  it("preserves completed steps and retries only the failed step", async () => {
    const harness = await createHarness({ failMethod: "generateCharacters", failAtCall: 1 });
    await runSteps(harness, ["STYLE"]);

    const failed = await harness.pipeline.runStep(harness.userId, harness.projectId, "CHARACTERS");
    expect(failed.project).toMatchObject({
      completedStep: 1,
      activeStep: "CHARACTERS",
      stepState: "FAILED",
    });
    expect(failed.project.lastError).toContain("Fake generateCharacters failure");

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
