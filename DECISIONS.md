# Engineering Decisions

## 1. Use Next.js for the whole application

Next.js was my choice before I asked Codex to plan the project. Codex proposed using the App Router for both the UI and Node.js route handlers instead of adding a second backend. I accepted that direction because one TypeScript application gives the reviewer one development command, keeps request and UI types close together, and fits the sixteen-hour scope. The cost is that long Gemini calls run inside the web process rather than a durable worker, so an interrupted process is recovered through persisted state rather than continuing an external job.

## 2. Use direct SQLite and private filesystem storage

Codex first proposed SQLite through Prisma. The backend subagent pushed back that an ORM and generated client added more setup than this fixed schema needed, and used `better-sqlite3` with explicit SQL instead. I kept the simpler implementation after its concurrency tests passed: SQLite stores users, hashed sessions, projects, interaction IDs, and item progress, while book text and images live below an ignored data directory. WAL mode and a conditional update give the project-level write coordination the JSON-file option would require me to build myself. The costs are handwritten schema evolution, synchronous database calls, and a deliberately local-only architecture.

## 3. Separate pipeline position from execution state

Codex proposed `completedStep`, `activeStep`, and `stepState` instead of one large status enum. That split can represent “characters complete, portraits running” after a refresh, while Draft/In progress/Done labels are derived rather than stored. I accepted the extra fields because the ordering and retry rules become explicit and testable. Codex's first plan also added an optimistic `version` counter; I removed it as unnecessary once a single conditional SQLite update became the claim operation. The cost is that every transition must maintain several related fields and a stale running state needs an explicit recovery rule.

## 4. Claim on the server and never retry Gemini automatically

The frontend agent disables the current button for feedback, but the backend claim is the actual duplicate guard across refreshes, double-clicks, and tabs. Gemini runs only after a short transaction changes the expected project state to `RUNNING`; a second caller sees that claim and receives the existing project without another model call. Each portrait is saved before the next begins, so retry skips completed work.

The first Codex plan copied the notebook workflow without noticing that its SDK client enables automatic retries. That was unsafe under this assessment's cost rule. I configured the JavaScript SDK for one attempt and added no retry loop; a transient API error becomes a visible failed step and only the user's button can retry it. The accepted limitation is the crash window after Gemini accepts work but before its response can be persisted—SQLite and an external API cannot provide one atomic transaction.

Gemini quota failures can include verbose provider details that should not be persisted or displayed. The backend therefore converts provider failures into short application-owned messages while keeping the failed step available for an explicit retry. The cost is less diagnostic detail in the UI; provider details belong in controlled server diagnostics.

## 5. Preserve the notebook's interaction chains and choose current models

Codex mapped the notebook into a text conversation—uploaded book, style, adult-character JSON, chapter JSON—and a separate image conversation—portrait context, two portraits, chapter illustration. I kept this because the full book is uploaded once, structured prompts retain the story context, and the final scene reuses the portrait history. Portrait calls are sequential and therefore slower than parallel generation, but that preserves image context and makes partial progress safe to resume. The response schema requests no more than two adults and one chapter, and server code caps the parsed arrays again rather than trusting model compliance.

The provisional plan named `gemini-3.7-flash` because the current notebook contains that ID. I checked Google's current model catalog and found that it is not listed there, while `gemini-3.6-flash` is the stable Interactions model and `gemini-3.1-flash-image` is the stable Nano Banana 2 model. I use those current model IDs by default and keep both configurable through environment variables. The cost is a small divergence from the notebook's model cell while preserving its required mechanics.

## 6. Resolve generated media through owned records

Codex's first route proposal accepted a catch-all media path. I replaced it with a project and asset identity: the server verifies the session owns the project, resolves the stored database path below the configured data root, and streams the result. Nothing generated is placed in `public/`, so knowing another asset URL cannot bypass ownership. The cost is one database lookup per image request and no direct static hosting, which is immaterial for at most three generated images per project.

*If I had one more day, what would I build next and why?* I would add a small, opt-in real-Gemini smoke harness for a public-domain excerpt, because the fake gateway proves our state machine but cannot catch provider-side model, schema, or SDK changes before a reviewer spends image quota in the UI.
