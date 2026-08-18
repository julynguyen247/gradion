"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client/api";
import type { PipelineStep, ProjectDetail } from "@/lib/client/types";
import { ProjectDetailView } from "./project-detail-view";
import { PageSkeleton } from "./spinner";

const POLL_INTERVAL_MS = 1800;

export function ProjectDetailScreen({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);

  const loadProject = useCallback(async (signal?: AbortSignal) => {
    const { project: nextProject } = await api.getProject(projectId, signal);
    setProject(nextProject);
    return nextProject;
  }, [projectId]);

  useEffect(() => {
    const controller = new AbortController();
    api.getProject(projectId, controller.signal)
      .then(({ project: nextProject }) => setProject(nextProject))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLoadError(error instanceof Error ? error.message : "We couldn't load this project.");
      });
    return () => controller.abort();
  }, [projectId]);

  useEffect(() => {
    if (project?.stepState !== "RUNNING") return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    const poll = async () => {
      try {
        await loadProject(controller.signal);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setActionError("Live updates paused. Your generation is still safe on the server.");
        }
      }
      if (!stopped) timer = setTimeout(poll, POLL_INTERVAL_MS);
    };
    timer = setTimeout(poll, POLL_INTERVAL_MS);
    return () => { stopped = true; controller.abort(); clearTimeout(timer); };
  }, [loadProject, project?.stepState]);

  async function runStep(step: PipelineStep, style?: string) {
    if (!project || project.stepState === "RUNNING" || actionPending) return;
    setActionError(null);
    setActionPending(true);
    setProject({ ...project, stepState: "RUNNING", activeStep: step, stepStartedAt: new Date().toISOString(), lastError: null });
    try {
      const response = await api.runStep(projectId, step, style);
      setProject(response.project);
    } catch (error) {
      try { await loadProject(); } catch { /* Keep the optimistic state and show the actionable request error. */ }
      setActionError(error instanceof Error ? error.message : "This step couldn't be started.");
    } finally {
      setActionPending(false);
    }
  }

  async function recover() {
    if (actionPending) return;
    setActionPending(true);
    setActionError(null);
    try {
      const { project: nextProject } = await api.recoverProject(projectId);
      setProject(nextProject);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "This step couldn't be recovered.");
    } finally {
      setActionPending(false);
    }
  }

  if (!project && !loadError) return <PageSkeleton detail />;
  if (!project) return <div className="page-width page-pad"><div className="error-state" role="alert"><h1>Project unavailable</h1><p>{loadError}</p><Link className="button button-secondary" href="/projects">Back to projects</Link></div></div>;
  return <ProjectDetailView project={project} actionPending={actionPending} actionError={actionError} onRunStep={runStep} onRecover={recover} />;
}
