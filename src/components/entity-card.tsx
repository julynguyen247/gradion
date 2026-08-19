import Image from "next/image";
import type { Character, Chapter } from "@/lib/client/types";
import { AlertIcon, SparkleIcon } from "./icons";
import { ArtGenerationAnimation } from "./art-generation-animation";

type Props =
  | { kind: "character"; item: Character; index: number }
  | { kind: "chapter"; item: Chapter; index: number };

export function EntityCard(props: Props) {
  const { item, kind, index } = props;
  const mediaUrl = kind === "character" ? item.portraitUrl : item.illustrationUrl;
  const isDone = item.state === "DONE" && Boolean(mediaUrl);
  return (
    <article className={`entity-card entity-${kind}`} style={{ "--card-index": index } as React.CSSProperties}>
      <div className="entity-media">
        {isDone && mediaUrl ? (
          <Image src={mediaUrl} alt={`${kind === "character" ? "Portrait" : "Illustration"} for ${item.name}`} fill sizes={kind === "character" ? "(max-width: 640px) 100vw, 320px" : "(max-width: 900px) 100vw, 720px"} unoptimized />
        ) : item.state === "RUNNING" ? (
          <div className="media-state media-generating" role="status" aria-label={`Generating ${kind} for ${item.name}`}><ArtGenerationAnimation /><strong>{kind === "character" ? `Painting ${item.name}` : "Painting the scene"}</strong><span>This image will appear here when it lands.</span></div>
        ) : item.state === "FAILED" ? (
          <div className="media-state media-failed"><AlertIcon /><strong>Image paused</strong><span>Retry the step to continue.</span></div>
        ) : (
          <div className="media-state media-pending"><SparkleIcon /><strong>Awaiting artwork</strong><span>{kind === "character" ? "Portrait not generated yet" : "Illustration not generated yet"}</span></div>
        )}
        <span className="entity-number">{String(index + 1).padStart(2, "0")}</span>
      </div>
      <div className="entity-body"><span className="entity-type">{kind}</span><h3>{item.name}</h3><p>{item.prompt}</p></div>
    </article>
  );
}
