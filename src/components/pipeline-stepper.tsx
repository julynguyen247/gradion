import { PIPELINE_STEPS } from "@/lib/client/format";
import type { ProjectDetail } from "@/lib/client/types";
import { CheckIcon } from "./icons";

export function PipelineStepper({ project }: { project: ProjectDetail }) {
  return (
    <ol className="pipeline-stepper" aria-label="Illustration pipeline progress">
      {PIPELINE_STEPS.map((step, index) => {
        const number = index + 1;
        const done = number <= project.completedStep;
        const current = number === project.completedStep + 1 && project.completedStep < 5;
        return (
          <li key={step.key} className={done ? "step-done" : current ? "step-current" : "step-pending"} aria-current={current ? "step" : undefined}>
            <span className="step-number">{done ? <CheckIcon /> : number}</span>
            <span className="step-copy"><strong>{step.label}</strong><small>{done ? "Complete" : current ? project.stepState === "RUNNING" ? "In progress" : project.stepState === "FAILED" ? "Needs attention" : "Up next" : "Pending"}</small></span>
            {index < PIPELINE_STEPS.length - 1 && <span className="step-connector" aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}
