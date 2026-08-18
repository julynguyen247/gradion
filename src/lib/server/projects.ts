import { randomUUID } from "node:crypto";
import path from "node:path";
import type { SqliteDatabase } from "./database";
import { notFound } from "./errors";
import type { ProjectFiles } from "./files";
import type {
  ChapterDTO,
  CharacterDTO,
  ProjectDetailDTO,
  ProjectSummaryDTO,
  Step,
  StepState,
} from "./types";

export interface ProjectRow {
  id: string;
  user_id: string;
  title: string;
  book_path: string;
  created_at: number;
  updated_at: number;
  completed_step: number;
  active_step: Step | null;
  step_state: StepState;
  step_started_at: number | null;
  last_error: string | null;
  style: string | null;
  gemini_file_name: string | null;
  gemini_file_uri: string | null;
  book_interaction_id: string | null;
  text_interaction_id: string | null;
  image_interaction_id: string | null;
  chapter_image_context_ready: number;
}

interface CharacterRow {
  id: string;
  name: string;
  prompt: string;
  state: CharacterDTO["state"];
  portrait_path: string | null;
  position: number;
}

interface ChapterRow {
  id: string;
  name: string;
  prompt: string;
  state: ChapterDTO["state"];
  illustration_path: string | null;
  position: number;
}

function statusFor(completedStep: number, stepState: StepState): ProjectSummaryDTO["status"] {
  if (completedStep === 5) return "DONE";
  if (completedStep === 0 && stepState !== "RUNNING") return "DRAFT";
  return "IN_PROGRESS";
}

function summary(row: ProjectRow): ProjectSummaryDTO {
  return {
    id: row.id,
    title: row.title,
    createdAt: new Date(row.created_at).toISOString(),
    status: statusFor(row.completed_step, row.step_state),
    completedStep: row.completed_step,
    activeStep: row.active_step,
    stepState: row.step_state,
  };
}

export class ProjectStore {
  constructor(
    public readonly database: SqliteDatabase,
    private readonly files: ProjectFiles,
    private readonly staleAfterMs: number,
  ) {}

  async create(userId: string, title: string, text: string): Promise<ProjectDetailDTO> {
    const projectId = randomUUID();
    const bookPath = await this.files.saveBook(userId, projectId, text);
    const now = Date.now();
    this.database
      .prepare(
        `INSERT INTO projects
         (id, user_id, title, book_path, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(projectId, userId, title.trim(), bookPath, now, now);
    return this.getDetail(userId, projectId);
  }

  list(userId: string): ProjectSummaryDTO[] {
    const rows = this.database
      .prepare("SELECT * FROM projects WHERE user_id = ? ORDER BY created_at DESC")
      .all(userId) as ProjectRow[];
    return rows.map(summary);
  }

  getOwnedRow(userId: string, projectId: string): ProjectRow {
    const row = this.database
      .prepare("SELECT * FROM projects WHERE id = ? AND user_id = ?")
      .get(projectId, userId) as ProjectRow | undefined;
    if (!row) throw notFound();
    return row;
  }

  async getDetail(userId: string, projectId: string): Promise<ProjectDetailDTO> {
    const row = this.getOwnedRow(userId, projectId);
    const characters = this.database
      .prepare(
        "SELECT id, name, prompt, state, portrait_path, position FROM characters WHERE project_id = ? ORDER BY position",
      )
      .all(projectId) as CharacterRow[];
    const chapters = this.database
      .prepare(
        "SELECT id, name, prompt, state, illustration_path, position FROM chapters WHERE project_id = ? ORDER BY position",
      )
      .all(projectId) as ChapterRow[];

    return {
      ...summary(row),
      bookText: await this.files.readBook(row.book_path),
      style: row.style,
      stepStartedAt: row.step_started_at ? new Date(row.step_started_at).toISOString() : null,
      lastError: row.last_error,
      canRecover:
        row.step_state === "RUNNING" &&
        row.step_started_at !== null &&
        row.step_started_at <= Date.now() - this.staleAfterMs,
      characters: characters.map((character) => ({
        id: character.id,
        name: character.name,
        prompt: character.prompt,
        state: character.state,
        portraitUrl: character.portrait_path
          ? `/api/projects/${projectId}/media/${character.id}`
          : null,
      })),
      chapters: chapters.map((chapter) => ({
        id: chapter.id,
        name: chapter.name,
        prompt: chapter.prompt,
        state: chapter.state,
        illustrationUrl: chapter.illustration_path
          ? `/api/projects/${projectId}/media/${chapter.id}`
          : null,
      })),
    };
  }

  getAsset(
    userId: string,
    projectId: string,
    assetId: string,
  ): { path: string; mimeType: string } {
    this.getOwnedRow(userId, projectId);
    const row = this.database
      .prepare(
        `SELECT portrait_path AS file_path FROM characters WHERE id = ? AND project_id = ?
         UNION ALL
         SELECT illustration_path AS file_path FROM chapters WHERE id = ? AND project_id = ?
         LIMIT 1`,
      )
      .get(assetId, projectId, assetId, projectId) as { file_path: string | null } | undefined;
    if (!row?.file_path) throw notFound();
    const extension = path.extname(row.file_path).toLowerCase();
    const mimeType = extension === ".jpg" || extension === ".jpeg"
      ? "image/jpeg"
      : extension === ".webp"
        ? "image/webp"
        : "image/png";
    return { path: row.file_path, mimeType };
  }

  async readAsset(filePath: string): Promise<Uint8Array> {
    return this.files.readAsset(filePath);
  }
}
