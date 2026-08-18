# Engineering Decisions

> This is a living draft started before implementation. It records the decisions made during planning, including corrections to Codex's first proposal. I will revise each entry in my own words as the implementation tests these assumptions. I will not add fictional pushback after the fact or submit this note unchanged.

## Use Next.js for the whole application

Next.js was my choice before I asked Codex to plan the project. Codex proposed using the App Router for both the UI and Node.js route handlers instead of treating Next.js as only the frontend and adding a second backend. I agreed because one TypeScript application gives me one development command, shared validation types, and fewer moving parts within a sixteen-hour assessment. The cost is that long Gemini requests run inside a web process rather than a dedicated worker, so the implementation must persist a server-side claim before calling Gemini and treat a server restart as an interrupted step that the user can recover.

## Use SQLite for state and the filesystem for content

The assessment allows JSON files, but Codex pushed toward SQLite because the hardest requirement is safely handling a double-click or two tabs, not storing a large amount of data. I accepted SQLite for users, sessions, projects, pipeline state, interaction IDs, characters, and chapters. Book text and generated images stay below a project-specific directory and are served through an ownership-checking route. This gives me database constraints and atomic conditional updates without running another service. The costs are a schema migration step, local-only storage, and no horizontal scaling; all three are acceptable for a local assessment.

## Model pipeline progress separately from execution state

Codex proposed storing `completedStep`, `activeStep`, and `stepState` rather than one large status enum. I kept that split because `completedStep = 2` and `activeStep = PORTRAITS` with `stepState = RUNNING` precisely describes a refresh during step 3. Project-list labels such as Draft, In progress, and Done are derived rather than stored, which avoids another field drifting out of sync. The trade-off is that every transition must maintain three related fields and validate that the requested step is exactly `completedStep + 1`.

The first Codex plan also added an optimistic `version` field on top of an atomic SQLite claim. On review, that was unnecessary complexity for a project row that permits only one active step. I rejected the extra version counter and will use one conditional update inside a short transaction; if it updates zero rows, another request already owns the step. This is the first place the AI plan was more complicated than the requirement.

## Claim work in the database and never retry Gemini automatically

Codex proposed disabling the button in the UI and atomically claiming a step on the server. I kept both, but only the database claim is a correctness mechanism: the disabled button is user feedback, while the conditional update handles refreshes, double-clicks, and separate tabs. Gemini runs outside the database transaction, and each successful item is persisted immediately. A failure marks only the active step failed; retries are explicit user actions and completed portraits are skipped.

The first plan did not call out that the notebook configures automatic SDK retries. That conflicts with the assessment's cost rule, so I am overriding that omission by configuring the Gemini client for a single attempt and adding no retry loop around it. A transient 429 or 5xx response becomes a visible failed step that the user may retry. This is the second place AI output was unsafe for the stated cost constraints. The remaining limitation is unavoidable: if the process dies after Gemini accepts a request but before its response is saved, SQLite and Gemini cannot provide exactly-once execution across that boundary.

## Preserve two Gemini interaction chains and checkpoint every item

Codex mapped the notebook into two persisted conversations. The text chain is book upload, style, adult-character JSON, and chapter JSON; the image chain is portrait context, portrait one, portrait two, and the chapter illustration. I accepted this because it sends the complete book once, lets chapter prompts reuse the established character descriptions, and lets the illustration model reuse earlier portraits. The server applies the 2-character and 1-chapter limits even if model output exceeds the requested JSON schema.

Portraits run sequentially to preserve the image chain, but each decoded file and interaction ID is saved before the next portrait begins. That makes partial progress visible and lets retry resume with only the missing item. The cost is slower portrait generation than parallel calls, but consistent characters and safe resumption matter more than saving one request duration.

## Resolve media by database-owned asset identity

Codex's first route proposal used a catch-all media path. I rejected that shape because accepting filesystem-like paths from the browser creates avoidable path-traversal and ownership mistakes. The client will request a project and asset identity; the server will look up the stored path, verify the session owns the project, resolve it below the configured data root, and then stream it. Generated files will never be placed in `public/`.

This is the third place the initial AI output was unsafe. The safer route adds a database lookup to every image request and prevents direct static-file caching, which is a reasonable cost for at most three images per project.

## If I had one more day

I would add a visible attempt history for each step, including its start time, finish time, outcome, and sanitized error. Retry behavior and API cost are the riskiest parts of this application; an attempt history would make them easier for a user to understand and easier for me to diagnose without changing the five-step pipeline.
