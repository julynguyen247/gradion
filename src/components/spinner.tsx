export function Spinner({ label = "Loading" }: { label?: string }) {
  return <span className="spinner" role="status" aria-label={label} />;
}

export function PageSkeleton({ detail = false }: { detail?: boolean }) {
  return (
    <div className="page-width page-pad" aria-label="Loading page" role="status">
      <div className="skeleton skeleton-kicker" />
      <div className="skeleton skeleton-heading" />
      {detail ? (
        <>
          <div className="skeleton skeleton-stepper" />
          <div className="detail-layout">
            <div className="skeleton skeleton-panel" />
            <div className="skeleton skeleton-aside" />
          </div>
        </>
      ) : (
        <div className="skeleton-list">
          <div className="skeleton skeleton-row" />
          <div className="skeleton skeleton-row" />
          <div className="skeleton skeleton-row" />
        </div>
      )}
      <span className="sr-only">Loading…</span>
    </div>
  );
}
