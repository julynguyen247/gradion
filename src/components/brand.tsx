import Link from "next/link";
import { SparkleIcon } from "./icons";

export function Brand({ linked = true }: { linked?: boolean }) {
  const content = (
    <span className="brand-lockup">
      <span className="brand-mark"><SparkleIcon /></span>
      <span className="brand-name">Gradion</span>
      <span className="brand-divider" aria-hidden="true" />
      <span className="brand-studio">Illustration Studio</span>
    </span>
  );

  return linked ? (
    <Link href="/projects" className="brand-link" aria-label="Gradion Illustration Studio — projects">
      {content}
    </Link>
  ) : content;
}
