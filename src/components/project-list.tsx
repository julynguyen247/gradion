import Link from "next/link";
import type { ProjectSummary } from "@/lib/client/types";
import { formatDate, projectStatusLabel, projectSummaryText } from "@/lib/client/format";
import { ArrowRightIcon, BookIcon, PlusIcon } from "./icons";

export function ProjectList({ projects }: { projects: ProjectSummary[] }) {
  if (!projects.length) {
    return (
      <section className="empty-state" aria-labelledby="empty-title">
        <div className="empty-illustration" aria-hidden="true"><BookIcon /><span><PlusIcon /></span></div>
        <h2 id="empty-title">Your first story starts here</h2>
        <p>Bring a book’s text and we’ll guide you through style, characters, portraits, and a final scene.</p>
        <Link className="button button-primary" href="/projects/new"><PlusIcon /> Create a project</Link>
      </section>
    );
  }
  return (
    <ul className="project-list" aria-label="Illustration projects">
      {projects.map((project) => (
        <li key={project.id}>
          <Link className="project-card" href={`/projects/${project.id}`}>
            <div className="project-monogram" aria-hidden="true">{project.title.trim().charAt(0).toUpperCase() || "B"}</div>
            <div className="project-main">
              <div className="project-title-row">
                <h2>{project.title}</h2>
                <span className={`status-pill status-${project.status.toLowerCase()}`}>{project.status === "IN_PROGRESS" && <span className="status-dot" />}{projectStatusLabel(project.status)}</span>
              </div>
              <p className="project-meta">Created {formatDate(project.createdAt)} <span aria-hidden="true">·</span> {projectSummaryText(project)}</p>
              <div className="mini-progress" aria-label={`${project.completedStep} of 5 steps complete`}>
                {[1, 2, 3, 4, 5].map((step) => <span key={step} className={step <= project.completedStep ? "is-complete" : project.stepState === "RUNNING" && step === project.completedStep + 1 ? "is-running" : ""} />)}
              </div>
            </div>
            <span className="project-open" aria-hidden="true"><ArrowRightIcon /></span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
