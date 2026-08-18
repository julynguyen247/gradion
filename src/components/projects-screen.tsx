"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import type { ProjectSummary } from "@/lib/client/types";
import { PlusIcon } from "./icons";
import { ProjectList } from "./project-list";
import { PageSkeleton } from "./spinner";

export function ProjectsScreen() {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api.listProjects(controller.signal).then(({ projects: rows }) => setProjects(rows)).catch((reason: unknown) => {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      setError(reason instanceof Error ? reason.message : "We couldn't load your projects.");
    });
    return () => controller.abort();
  }, []);

  if (projects === null && !error) return <PageSkeleton />;
  return (
    <div className="page-width page-pad">
      <div className="page-header">
        <div><p className="eyebrow">Your library</p><h1>Illustration projects</h1><p>Pick up where you left off, or begin a new visual world.</p></div>
        <Link className="button button-primary" href="/projects/new"><PlusIcon /> New project</Link>
      </div>
      {error ? <div className="error-state" role="alert"><h2>Projects couldn’t be loaded</h2><p>{error}</p><button className="button button-secondary" type="button" onClick={() => window.location.reload()}>Try again</button></div> : <ProjectList projects={projects ?? []} />}
    </div>
  );
}
