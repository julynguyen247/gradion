import path from "node:path";

function positiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export interface ServerConfig {
  databasePath: string;
  dataRoot: string;
  staleAfterMs: number;
  sessionTtlMs: number;
  geminiApiKey: string;
  textModel: string;
  imageModel: string;
}

export function getServerConfig(): ServerConfig {
  return {
    databasePath: path.resolve(
      /* turbopackIgnore: true */ process.env.DATABASE_PATH ?? "data/gradion.db",
    ),
    dataRoot: path.resolve(
      /* turbopackIgnore: true */ process.env.DATA_ROOT ?? "data/files",
    ),
    staleAfterMs: positiveNumber(process.env.STEP_STALE_AFTER_MS, 10 * 60_000),
    sessionTtlMs: positiveNumber(process.env.SESSION_TTL_MS, 30 * 24 * 60 * 60_000),
    geminiApiKey: process.env.GEMINI_API_KEY ?? "",
    textModel: process.env.GEMINI_TEXT_MODEL ?? "gemini-3.6-flash",
    imageModel: process.env.GEMINI_IMAGE_MODEL ?? "gemini-3.1-flash-image",
  };
}
