# Engineering Decisions

## Use Next.js for the whole application

Next.js was my choice before I asked Codex to plan the project. Codex proposed using the App Router for both the UI and Node.js route handlers instead of adding a second backend. I accepted that direction because one TypeScript application gives the reviewer one development command, keeps request and UI types close together, and fits the sixteen-hour scope. The cost is that long Gemini calls run inside the web process rather than a durable worker, so an interrupted process is recovered through persisted state rather than continuing an external job.

## Use direct SQLite and private filesystem storage

Codex first proposed SQLite through Prisma. The backend subagent pushed back that an ORM and generated client added more setup than this fixed schema needed, and used `better-sqlite3` with explicit SQL instead. I kept the simpler implementation after its concurrency tests passed: SQLite stores users, hashed sessions, projects, interaction IDs, and item progress, while book text and images live below an ignored data directory. WAL mode and a conditional update give the project-level write coordination the JSON-file option would require me to build myself. The costs are handwritten schema evolution, synchronous database calls, and a deliberately local-only architecture.

## Separate pipeline position from execution state

Codex proposed `completedStep`, `activeStep`, and `stepState` instead of one large status enum. That split can represent “characters complete, portraits running” after a refresh, while Draft/In progress/Done labels are derived rather than stored. I accepted the extra fields because the ordering and retry rules become explicit and testable. Codex's first plan also added an optimistic `version` counter; I removed it as unnecessary once a single conditional SQLite update became the claim operation. The cost is that every transition must maintain several related fields and a stale running state needs an explicit recovery rule.

## Claim on the server and never retry Gemini automatically

The frontend agent disables the current button for feedback, but the backend claim is the actual duplicate guard across refreshes, double-clicks, and tabs. Gemini runs only after a short transaction changes the expected project state to `RUNNING`; a second caller sees that claim and receives the existing project without another model call. Each portrait is saved before the next begins, so retry skips completed work.

The first Codex plan copied the notebook workflow without noticing that its SDK client enables automatic retries. That was unsafe under this assessment's cost rule. I configured the JavaScript SDK for one attempt and added no retry loop; a transient API error becomes a visible failed step and only the user's button can retry it. The accepted limitation is the crash window after Gemini accepts work but before its response can be persisted—SQLite and an external API cannot provide one atomic transaction.

## Preserve the notebook's two interaction chains

Codex mapped the notebook into a text conversation—uploaded book, style, adult-character JSON, chapter JSON—and a separate image conversation—portrait context, two portraits, chapter illustration. I kept this because the full book is uploaded once, structured prompts retain the story context, and the final scene reuses the portrait history. Portrait calls are sequential and therefore slower than parallel generation, but that preserves image context and makes partial progress safe to resume. The response schema requests no more than two adults and one chapter, and server code caps the parsed arrays again rather than trusting model compliance.

The provisional plan named `gemini-3.7-flash` because the current notebook contains that ID. The backend subagent checked the official model catalog and found that it is not listed there, while `gemini-3.6-flash` is the supported stable Interactions model. I changed the default to `gemini-3.6-flash` and use `gemini-3.1-flash-image` for Nano Banana, with both IDs configurable through environment variables. The cost is a small divergence from the notebook's model cell while preserving its required mechanics.

## Resolve generated media through owned records

Codex's first route proposal accepted a catch-all media path. I replaced it with a project and asset identity: the server verifies the session owns the project, resolves the stored database path below the configured data root, and streams the result. Nothing generated is placed in `public/`, so knowing another asset URL cannot bypass ownership. The cost is one database lookup per image request and no direct static hosting, which is immaterial for at most three generated images per project.

## Sanitize provider errors before persistence and display

Gemini quota failures can include long SDK messages with internal metric names, model IDs, billing guidance, and documentation URLs. I chose not to persist or expose that provider text. The pipeline classifies provider failures at the backend boundary and stores only short, application-owned messages; a 429 or quota failure becomes “Generation limit reached. Please try again later.” Existing raw errors written by older versions are sanitized when the project is next loaded, and the frontend applies the same concise fallback while state refreshes.

The failed step keeps a visible “Try again” action, but retry remains explicitly user-triggered so an exhausted quota cannot cause repeated billable calls. The tradeoff is less diagnostic detail in the UI and database. Provider details belong in controlled server diagnostics rather than user-facing project state.
