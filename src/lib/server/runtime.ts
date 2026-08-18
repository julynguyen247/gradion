import { createDatabase } from "./database";
import { getServerConfig } from "./config";
import { ProjectFiles } from "./files";
import { GoogleGeminiGateway } from "./gemini/google";
import { PipelineService } from "./pipeline";
import { ProjectStore } from "./projects";
import { SessionStore } from "./auth";

export interface ServerRuntime {
  config: ReturnType<typeof getServerConfig>;
  files: ProjectFiles;
  projects: ProjectStore;
  sessions: SessionStore;
  pipeline(): PipelineService;
}

declare global {
  var __gradionRuntime: ServerRuntime | undefined;
}

function buildRuntime(): ServerRuntime {
  const config = getServerConfig();
  const database = createDatabase(config.databasePath);
  const files = new ProjectFiles(config.dataRoot);
  const projects = new ProjectStore(database, files, config.staleAfterMs);
  const sessions = new SessionStore(database, config.sessionTtlMs);
  let pipelineService: PipelineService | undefined;

  return {
    config,
    files,
    projects,
    sessions,
    pipeline() {
      pipelineService ??= new PipelineService(
        projects,
        files,
        new GoogleGeminiGateway(config.geminiApiKey, config.textModel, config.imageModel),
        config.staleAfterMs,
      );
      return pipelineService;
    },
  };
}

export function getRuntime(): ServerRuntime {
  globalThis.__gradionRuntime ??= buildRuntime();
  return globalThis.__gradionRuntime;
}
