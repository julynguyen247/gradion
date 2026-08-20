import { randomUUID } from "node:crypto";
import { AppError } from "./errors";
import type { ProjectFiles } from "./files";
import type { GeminiGateway, PromptItem } from "./gemini/gateway";
import { PIPELINE_INTERRUPTED_MESSAGE, toSafePipelineFailure } from "./pipeline-errors";
import type { ProjectStore, ProjectRow } from "./projects";
import { stepNumber, type ProjectDetailDTO, type Step } from "./types";

export interface RunStepResult {
  project: ProjectDetailDTO;
  alreadyRunning: boolean;
}

interface CharacterWorkRow extends PromptItem {
  id: string;
  portrait_path: string | null;
}

interface ChapterWorkRow extends PromptItem {
  id: string;
  illustration_path: string | null;
}

export class PipelineService {
  constructor(
    private readonly projects: ProjectStore,
    private readonly files: ProjectFiles,
    private readonly gateway: GeminiGateway,
    private readonly staleAfterMs: number,
  ) {}

  async runStep(
    userId: string,
    projectId: string,
    step: Step,
    options: { style?: string } = {},
  ): Promise<RunStepResult> {
    const claim = this.claim(userId, projectId, step);
    if (!claim) {
      return {
        project: await this.projects.getDetail(userId, projectId),
        alreadyRunning: true,
      };
    }

    try {
      if (step === "STYLE") await this.runStyle(claim, options.style);
      if (step === "CHARACTERS") await this.runCharacters(claim);
      if (step === "PORTRAITS") await this.runPortraits(claim);
      if (step === "CHAPTERS") await this.runChapters(claim);
      if (step === "ILLUSTRATIONS") await this.runIllustrations(claim);
      this.complete(projectId, step);
    } catch (error) {
      this.fail(projectId, step, error);
    }

    return {
      project: await this.projects.getDetail(userId, projectId),
      alreadyRunning: false,
    };
  }

  async recover(userId: string, projectId: string): Promise<ProjectDetailDTO> {
    const row = this.projects.getOwnedRow(userId, projectId);
    if (row.step_state !== "RUNNING" || !row.active_step || row.step_started_at === null) {
      throw new AppError("STEP_NOT_RUNNING", "There is no running step to recover.", 409);
    }
    const cutoff = Date.now() - this.staleAfterMs;
    const result = this.projects.database
      .prepare(
        `UPDATE projects
         SET step_state = 'FAILED', last_error = ?, updated_at = ?
         WHERE id = ? AND user_id = ? AND step_state = 'RUNNING' AND step_started_at <= ?`,
      )
      .run(PIPELINE_INTERRUPTED_MESSAGE, Date.now(), projectId, userId, cutoff);
    if (result.changes !== 1) {
      throw new AppError("STEP_NOT_STALE", "This step is still active and cannot be recovered yet.", 409);
    }
    return this.projects.getDetail(userId, projectId);
  }

  private claim(userId: string, projectId: string, step: Step): ProjectRow | null {
    return this.projects.database.transaction(() => {
      const row = this.projects.getOwnedRow(userId, projectId);
      if (row.step_state === "RUNNING") {
        if (row.active_step === step) return null;
        throw new AppError("STEP_RUNNING", `${row.active_step} is already running.`, 409);
      }

      const requested = stepNumber(step);
      const expected = row.completed_step + 1;
      if (requested < expected) {
        throw new AppError("STEP_ALREADY_COMPLETED", `${step} is already complete.`, 409);
      }
      if (requested > expected) {
        throw new AppError("STEP_OUT_OF_ORDER", `Complete step ${expected} before ${step}.`, 409);
      }
      if (row.step_state === "FAILED" && row.active_step !== step) {
        throw new AppError("RETRY_FAILED_STEP", `Retry ${row.active_step} before continuing.`, 409);
      }

      const now = Date.now();
      const updated = this.projects.database
        .prepare(
          `UPDATE projects
           SET active_step = ?, step_state = 'RUNNING', step_started_at = ?, last_error = NULL, updated_at = ?
           WHERE id = ? AND user_id = ? AND completed_step = ? AND step_state IN ('IDLE','FAILED')`,
        )
        .run(step, now, now, projectId, userId, row.completed_step);
      if (updated.changes !== 1) return null;
      return {
        ...row,
        active_step: step,
        step_state: "RUNNING" as const,
        step_started_at: now,
      };
    })();
  }

  private async runStyle(row: ProjectRow, requestedStyle?: string): Promise<void> {
    const preservedStyle = requestedStyle ?? row.style ?? undefined;
    if (requestedStyle) {
      this.projects.database
        .prepare("UPDATE projects SET style = ?, updated_at = ? WHERE id = ?")
        .run(requestedStyle, Date.now(), row.id);
    }

    // The provider result is checkpointed before the project-level transition.
    // A process can stop in that narrow gap, so an explicit retry should finish
    // the transition without spending quota on the same style again.
    if (row.style && row.text_interaction_id) return;

    let fileUri = row.gemini_file_uri;
    if (!fileUri) {
      this.heartbeat(row.id);
      const uploaded = await this.gateway.uploadBook(row.book_path);
      fileUri = uploaded.uri;
      this.projects.database
        .prepare("UPDATE projects SET gemini_file_name = ?, gemini_file_uri = ?, updated_at = ? WHERE id = ?")
        .run(uploaded.name, uploaded.uri, Date.now(), row.id);
    }

    let bookInteractionId = row.book_interaction_id;
    if (!bookInteractionId) {
      this.heartbeat(row.id);
      bookInteractionId = await this.gateway.startBook(fileUri);
      this.projects.database
        .prepare("UPDATE projects SET book_interaction_id = ?, updated_at = ? WHERE id = ?")
        .run(bookInteractionId, Date.now(), row.id);
    }

    this.heartbeat(row.id);
    const result = await this.gateway.generateStyle(bookInteractionId, preservedStyle);
    this.projects.database
      .prepare("UPDATE projects SET style = ?, text_interaction_id = ?, updated_at = ? WHERE id = ?")
      .run(result.text, result.interactionId, Date.now(), row.id);
  }

  private async runCharacters(row: ProjectRow): Promise<void> {
    const current = this.refresh(row.id);
    if (!current.text_interaction_id) throw new Error("Style interaction is missing.");
    if (this.countItems("characters", row.id) > 0) return;
    this.heartbeat(row.id);
    const result = await this.gateway.generateCharacters(current.text_interaction_id);
    const characters = this.capItems(result.items, 2, "characters");

    this.projects.database.transaction(() => {
      this.projects.database.prepare("DELETE FROM characters WHERE project_id = ?").run(row.id);
      const insert = this.projects.database.prepare(
        `INSERT INTO characters (id, project_id, position, name, prompt)
         VALUES (?, ?, ?, ?, ?)`,
      );
      characters.forEach((character, position) =>
        insert.run(randomUUID(), row.id, position, character.name, character.prompt),
      );
      this.projects.database
        .prepare("UPDATE projects SET text_interaction_id = ?, updated_at = ? WHERE id = ?")
        .run(result.interactionId, Date.now(), row.id);
    })();
  }

  private async runPortraits(row: ProjectRow): Promise<void> {
    const current = this.refresh(row.id);
    if (!current.style) throw new Error("Project style is missing.");
    let imageInteractionId = current.image_interaction_id;
    if (!imageInteractionId) {
      imageInteractionId = await this.gateway.startImageContext(current.title, current.style);
      this.projects.database
        .prepare("UPDATE projects SET image_interaction_id = ?, updated_at = ? WHERE id = ?")
        .run(imageInteractionId, Date.now(), row.id);
    }

    const characters = this.projects.database
      .prepare(
        "SELECT id, name, prompt, portrait_path FROM characters WHERE project_id = ? ORDER BY position LIMIT 2",
      )
      .all(row.id) as CharacterWorkRow[];
    if (characters.length === 0) throw new Error("No characters are available for portraits.");

    for (const character of characters) {
      if (character.portrait_path) continue;
      this.projects.database
        .prepare("UPDATE characters SET state = 'RUNNING' WHERE id = ?")
        .run(character.id);
      this.heartbeat(row.id);
      try {
        const image = await this.gateway.generatePortrait(imageInteractionId, character);
        const filePath = await this.files.saveImage(
          row.user_id,
          row.id,
          "portraits",
          character.id,
          image.data,
          image.mimeType,
        );
        this.projects.database.transaction(() => {
          this.projects.database
            .prepare(
              "UPDATE characters SET state = 'DONE', portrait_path = ?, image_interaction_id = ? WHERE id = ?",
            )
            .run(filePath, image.interactionId, character.id);
          this.projects.database
            .prepare("UPDATE projects SET image_interaction_id = ?, updated_at = ? WHERE id = ?")
            .run(image.interactionId, Date.now(), row.id);
        })();
        imageInteractionId = image.interactionId;
      } catch (error) {
        this.projects.database.prepare("UPDATE characters SET state = 'FAILED' WHERE id = ?").run(character.id);
        throw error;
      }
    }
  }

  private async runChapters(row: ProjectRow): Promise<void> {
    const current = this.refresh(row.id);
    if (!current.text_interaction_id) throw new Error("Character interaction is missing.");
    if (this.countItems("chapters", row.id) > 0) return;
    this.heartbeat(row.id);
    const result = await this.gateway.generateChapters(current.text_interaction_id);
    const chapters = this.capItems(result.items, 1, "chapters");

    this.projects.database.transaction(() => {
      this.projects.database.prepare("DELETE FROM chapters WHERE project_id = ?").run(row.id);
      const chapter = chapters[0];
      this.projects.database
        .prepare(
          `INSERT INTO chapters (id, project_id, position, name, prompt)
           VALUES (?, ?, 0, ?, ?)`,
        )
        .run(randomUUID(), row.id, chapter.name, chapter.prompt);
      this.projects.database
        .prepare("UPDATE projects SET text_interaction_id = ?, updated_at = ? WHERE id = ?")
        .run(result.interactionId, Date.now(), row.id);
    })();
  }

  private async runIllustrations(row: ProjectRow): Promise<void> {
    const current = this.refresh(row.id);
    let imageInteractionId = current.image_interaction_id;
    if (!imageInteractionId) throw new Error("Portrait interaction is missing.");
    if (!current.chapter_image_context_ready) {
      this.heartbeat(row.id);
      imageInteractionId = await this.gateway.startChapterImageContext(imageInteractionId);
      this.projects.database
        .prepare(
          "UPDATE projects SET image_interaction_id = ?, chapter_image_context_ready = 1, updated_at = ? WHERE id = ?",
        )
        .run(imageInteractionId, Date.now(), row.id);
    }

    const chapter = this.projects.database
      .prepare(
        "SELECT id, name, prompt, illustration_path FROM chapters WHERE project_id = ? ORDER BY position LIMIT 1",
      )
      .get(row.id) as ChapterWorkRow | undefined;
    if (!chapter) throw new Error("No chapter is available to illustrate.");
    if (chapter.illustration_path) return;

    this.projects.database.prepare("UPDATE chapters SET state = 'RUNNING' WHERE id = ?").run(chapter.id);
    this.heartbeat(row.id);
    try {
      const image = await this.gateway.generateIllustration(imageInteractionId, chapter);
      const filePath = await this.files.saveImage(
        row.user_id,
        row.id,
        "illustrations",
        chapter.id,
        image.data,
        image.mimeType,
      );
      this.projects.database.transaction(() => {
        this.projects.database
          .prepare(
            "UPDATE chapters SET state = 'DONE', illustration_path = ?, image_interaction_id = ? WHERE id = ?",
          )
          .run(filePath, image.interactionId, chapter.id);
        this.projects.database
          .prepare("UPDATE projects SET image_interaction_id = ?, updated_at = ? WHERE id = ?")
          .run(image.interactionId, Date.now(), row.id);
      })();
    } catch (error) {
      this.projects.database.prepare("UPDATE chapters SET state = 'FAILED' WHERE id = ?").run(chapter.id);
      throw error;
    }
  }

  private complete(projectId: string, step: Step): void {
    const result = this.projects.database
      .prepare(
        `UPDATE projects
         SET completed_step = ?, active_step = NULL, step_state = 'IDLE', step_started_at = NULL,
             last_error = NULL, updated_at = ?
         WHERE id = ? AND active_step = ? AND step_state = 'RUNNING'`,
      )
      .run(stepNumber(step), Date.now(), projectId, step);
    if (result.changes !== 1) throw new Error("Pipeline claim was lost before completion.");
  }

  private fail(projectId: string, step: Step, error: unknown): void {
    const failure = toSafePipelineFailure(error);
    this.projects.database
      .prepare(
        `UPDATE projects SET step_state = 'FAILED', last_error = ?, updated_at = ?
         WHERE id = ? AND active_step = ? AND step_state = 'RUNNING'`,
      )
      .run(failure.message, Date.now(), projectId, step);
  }

  private heartbeat(projectId: string): void {
    const now = Date.now();
    this.projects.database
      .prepare("UPDATE projects SET step_started_at = ?, updated_at = ? WHERE id = ? AND step_state = 'RUNNING'")
      .run(now, now, projectId);
  }

  private refresh(projectId: string): ProjectRow {
    return this.projects.database.prepare("SELECT * FROM projects WHERE id = ?").get(projectId) as ProjectRow;
  }

  private countItems(table: "characters" | "chapters", projectId: string): number {
    const row = this.projects.database
      .prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE project_id = ?`)
      .get(projectId) as { count: number };
    return row.count;
  }

  private capItems(items: PromptItem[], cap: number, label: string): PromptItem[] {
    const capped = items.slice(0, cap);
    if (capped.length === 0) throw new Error(`Gemini returned no ${label}.`);
    return capped;
  }
}
