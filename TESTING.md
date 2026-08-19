# Testing

## Strategy

The backend tests focus on the state transitions where a UI-only check would be misleading. They use a temporary SQLite database, temporary project files, and a deterministic Gemini gateway, so no test spends API quota. The suite covers strict step ordering, an atomic duplicate claim, failure and same-step retry, rejection of premature stale recovery, explicit stale recovery, server-side 2/1 caps, partial portrait resumption, owner isolation, and a persisted happy path through all five steps.

The frontend tests use Vitest, jsdom, and React Testing Library. They cover the project-list empty state and Draft/In progress/Done rendering, plus the detail screen's ready, named-running, mixed per-item progress, failed/retry, stale/recovery, and completed states. These are the states most likely to regress while connecting the UI to long-running backend work.

I deliberately did not mock every form field or test Next.js itself. Browser verification covered identity → empty project list → project creation → project detail at desktop and 390px mobile widths. A real five-step Gemini browser run remains a manual check because it consumes image quota; the automated full-pipeline test uses the fake gateway instead.

## Real test report

Run on 2026-08-19 with Node.js 26.4.0 and npm 12.0.2:

```text
> gradion@0.1.0 test
> vitest run

 RUN  v4.1.10 /home/khoi/Downloads/gradion-assessment

 Test Files  4 passed (4)
      Tests  26 passed (26)
   Duration  937ms
```

The same verification pass also completed `npm run lint`, `npx tsc --noEmit`, and `npm run build` successfully. The production build generated all four page routes and all six dynamic API routes.
