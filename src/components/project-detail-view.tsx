"use client";

import Link from "next/link";
import { useState } from "react";
import { currentStepFor, formatDate, PIPELINE_STEPS } from "@/lib/client/format";
import type { PipelineStep, ProjectDetail } from "@/lib/client/types";
import { AlertIcon, ArrowLeftIcon, ArrowRightIcon, CheckIcon, SparkleIcon } from "./icons";
import { Spinner } from "./spinner";
import { PipelineStepper } from "./pipeline-stepper";
import { BookReaderDialog } from "./book-reader-dialog";
import { EntityCard } from "./entity-card";
import { ArtGenerationAnimation } from "./art-generation-animation";

type ProjectDetailViewProps = {
  project: ProjectDetail;
  actionPending?: boolean;
  actionError?: string | null;
  onRunStep: (step: PipelineStep, style?: string) => void | Promise<void>;
  onRecover: () => void | Promise<void>;
};

const QUOTA_ERROR_PATTERN = /(?:\b429\b|generation limit reached|quota (?:has been |was )?exceeded|exceeded (?:your )?(?:current )?quota|rate[- ]?limit|resource[-_ ]?exhausted|too many requests)/i;

function isQuotaError(message?: string | null) {
  return Boolean(message && QUOTA_ERROR_PATTERN.test(message));
}

function failureCopy(message: string | null, stepLabel: string) {
  if (isQuotaError(message)) {
    return {
      eyebrow: "Usage limit reached",
      title: "Generation limit reached.",
      message: "Please try again later.",
    };
  }

  return {
    eyebrow: "Generation paused",
    title: `${stepLabel} needs another try.`,
    message: message ?? "The generation request did not finish. Completed work has not been changed.",
  };
}

function actionErrorCopy(message: string) {
  return isQuotaError(message)
    ? "Generation limit reached. Please try again later."
    : message;
}

export function ProjectDetailView({ project, actionPending = false, actionError, onRunStep, onRecover }: ProjectDetailViewProps) {
  const [style, setStyle] = useState("");
  const currentStep = currentStepFor(project.completedStep);
  const activeStep = project.activeStep ?? currentStep?.key;
  const runningConfig = PIPELINE_STEPS.find((step) => step.key === activeStep);
  const isComplete = project.completedStep >= 5;
  const isArtworkStep = activeStep === "PORTRAITS" || activeStep === "ILLUSTRATIONS";
  const failedStepLabel = runningConfig?.label ?? "This step";
  const failedCopy = failureCopy(project.lastError, failedStepLabel);

  return (
    <div className="page-width page-pad detail-page">
      <Link className="back-link" href="/projects"><ArrowLeftIcon /> All projects</Link>
      <div className="detail-heading">
        <div><p className="eyebrow">Illustration project</p><h1>{project.title}</h1><p>Created {formatDate(project.createdAt)} <span aria-hidden="true">·</span> {project.completedStep} of 5 steps complete</p></div>
        <BookReaderDialog title={project.title} text={project.bookText} />
      </div>

      <PipelineStepper project={project} />

      <div className="detail-layout">
        <div className="detail-content">
          <section className={`action-panel ${project.stepState === "FAILED" ? "action-failed" : project.canRecover ? "action-stale" : isComplete ? "action-complete" : ""}`} aria-labelledby="action-title" aria-live="polite">
            {isComplete ? (
              <div className="action-message"><span className="action-icon success"><CheckIcon /></span><div><p className="eyebrow">Project complete</p><h2 id="action-title">Your illustrated story is ready.</h2><p>All five steps are safely saved. Reopen this project any time without regenerating a thing.</p></div></div>
            ) : project.canRecover ? (
              <><div className="action-message"><span className="action-icon warning"><AlertIcon /></span><div><p className="eyebrow">Step interrupted</p><h2 id="action-title">{runningConfig?.label ?? "This step"} has been running too long.</h2><p>The server may have stopped mid-request. Everything completed before this point is still saved.</p></div></div><button className="button button-secondary" type="button" onClick={onRecover} disabled={actionPending}>{actionPending ? <><Spinner /> Recovering…</> : <>Recover this step <ArrowRightIcon /></>}</button></>
            ) : project.stepState === "FAILED" ? (
              <><div className="action-message"><span className="action-icon danger"><AlertIcon /></span><div><p className="eyebrow">{failedCopy.eyebrow}</p><h2 id="action-title">{failedCopy.title}</h2><p>{failedCopy.message}</p></div></div><button className="button button-primary" type="button" onClick={() => activeStep && onRunStep(activeStep)} disabled={actionPending}>{actionPending ? <><Spinner /> Trying again…</> : <>Try again <ArrowRightIcon /></>}</button></>
            ) : project.stepState === "RUNNING" || actionPending ? (
              <div className={`running-panel${isArtworkStep ? " running-panel-artwork" : ""}`}>{isArtworkStep ? <ArtGenerationAnimation compact /> : <span className="running-orbit"><SparkleIcon /></span>}<div><p className="eyebrow">Step {project.completedStep + 1} of 5 is running</p><h2 id="action-title">{runningConfig?.runningLabel ?? "Working on your story"}…</h2><p>Long Gemini calls can take a minute. You can leave safely—this work continues and the page will resume here.</p></div><span className="running-badge"><span /> Live</span></div>
            ) : currentStep ? (
              <><div className="action-ready"><div><p className="eyebrow">Up next · Step {project.completedStep + 1}</p><h2 id="action-title">{currentStep.label}</h2><p>{currentStep.description}</p></div><span className="step-big-number">{String(project.completedStep + 1).padStart(2, "0")}</span></div>{currentStep.key === "STYLE" && <div className="field-group style-field"><label htmlFor="art-style">Art direction <span>(optional)</span></label><input id="art-style" value={style} onChange={(event) => setStyle(event.target.value)} placeholder="e.g. luminous gouache with expressive ink lines" /><p className="field-note">Leave blank and Gemini will choose a style from the tone of your book.</p></div>}<button className="button button-primary" type="button" onClick={() => onRunStep(currentStep.key, style)} disabled={actionPending}>{currentStep.verb} <ArrowRightIcon /></button></>
            ) : null}
            {actionError && project.stepState !== "FAILED" && <div className="inline-alert" role="alert"><AlertIcon /> {actionErrorCopy(actionError)}</div>}
          </section>

          {project.chapters.length > 0 && <section className="entity-section" aria-labelledby="chapters-title"><div className="section-heading"><div><p className="eyebrow">Scene direction</p><h2 id="chapters-title">Chapter</h2></div><span>{project.chapters.length} scene</span></div><div className="chapter-grid">{project.chapters.map((chapter, index) => <EntityCard key={chapter.id} kind="chapter" item={chapter} index={index} />)}</div></section>}
          {project.characters.length > 0 && <section className="entity-section" aria-labelledby="characters-title"><div className="section-heading"><div><p className="eyebrow">Cast</p><h2 id="characters-title">Characters</h2></div><span>{project.characters.length} of 2 maximum</span></div><div className="character-grid">{project.characters.map((character, index) => <EntityCard key={character.id} kind="character" item={character} index={index} />)}</div></section>}
        </div>

        <aside className="detail-sidebar">
          {project.style ? <section className="style-card"><span className="style-swatch"><SparkleIcon /></span><p className="eyebrow">Visual language</p><h2>Art style</h2><p>{project.style}</p></section> : <section className="book-preview"><p className="eyebrow">Source text</p><h2>Your book</h2><blockquote>{project.bookText.slice(0, 320)}{project.bookText.length > 320 ? "…" : ""}</blockquote><p className="sidebar-hint">Use “Read full text” above to open the complete book.</p></section>}
          <section className="process-note"><span><SparkleIcon /></span><div><h2>Safe to step away</h2><p>Results are saved after every step—and after each image—so refreshing never starts from scratch.</p></div></section>
        </aside>
      </div>
    </div>
  );
}
