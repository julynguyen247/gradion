"use client";

import { useEffect } from "react";
import { AlertIcon } from "@/components/icons";

export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <main className="page-width page-pad">
      <div className="error-state" role="alert">
        <AlertIcon width="28" aria-hidden="true" />
        <h1>Something slipped between the pages.</h1>
        <p>The page couldn’t be displayed. Your saved project data has not been changed.</p>
        <button className="button button-secondary" type="button" onClick={retry}>Try this page again</button>
      </div>
    </main>
  );
}
