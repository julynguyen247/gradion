type ArtGenerationAnimationProps = {
  compact?: boolean;
};

export function ArtGenerationAnimation({ compact = false }: ArtGenerationAnimationProps) {
  return (
    <span
      className={`art-generation-animation${compact ? " art-generation-compact" : ""}`}
      data-testid="art-generation-animation"
      aria-hidden="true"
    >
      <span className="art-generation-canvas">
        <span className="art-generation-wash art-generation-wash-one" />
        <span className="art-generation-wash art-generation-wash-two" />
        <span className="art-generation-stroke art-generation-stroke-one" />
        <span className="art-generation-stroke art-generation-stroke-two" />
      </span>
      <span className="art-generation-brush">
        <span className="art-generation-bristles" />
      </span>
      <span className="art-generation-spark art-generation-spark-one" />
      <span className="art-generation-spark art-generation-spark-two" />
      <span className="art-generation-spark art-generation-spark-three" />
    </span>
  );
}
