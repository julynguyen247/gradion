# Gradion Assessment Implementation Plan

## Goal and constraints

Build the required five-step book illustration workflow in at most about 16 focused hours. The submission should optimize for a correct, resumable full-stack flow and a clear engineering story, not bonus features.

Hard constraints to keep visible while building:

- The user explicitly runs one step at a time, in order: style, characters, portraits, chapters, illustrations.
- Generate at most 2 adult characters and 1 chapter. Enforce both caps on the server.
- Send the complete book to Gemini once, then reuse interaction IDs across later text calls.
- Persist every completed result and every generated image as soon as it arrives.
- A refresh, duplicate click, or second tab must not start a duplicate call.
- A failed or abandoned step can be retried without rerunning completed work.
- Images and book text stay on the local filesystem and are served by an authenticated app route.
- Do not add animation, music, narration, deployment, a queue, or other bonus scope until all required behavior and documentation are complete.

## Recommended stack

- Next.js App Router with TypeScript, using the Node.js runtime for route handlers
- React Server Components for initial page loads; small client components for forms, polling, and live progress
- Tailwind CSS and Lucide icons; build a small local component set rather than adopting a large UI kit
- SQLite through `better-sqlite3` for durable state and explicit atomic conditional updates
- Zod for request and Gemini response validation
- Official `@google/genai` JavaScript SDK, with model IDs supplied through environment variables
- Vitest, React Testing Library, and a fake Gemini adapter for tests

Use one repository and one Next.js process. Do not create a separate API service or Docker setup. SQLite lives at `data/app.db`; private files live below `data/users/<user-id>/projects/<project-id>/`.

Provisional model defaults, based on the current notebook and Gemini documentation checked on 2026-08-18:

- Text: `gemini-3.6-flash` (the supported stable Interactions model; the notebook currently names `gemini-3.7-flash`, which is not listed in the official model catalog)
- Image: `gemini-3.1-flash-image` for better multi-image/character consistency; switch to another current Nano Banana model through `GEMINI_IMAGE_MODEL` if account availability or cost requires it

Before implementation, confirm model access and image limits with the actual assessment API key. Keep model selection configurable because IDs and availability change.

## Architecture

### Routes and screens

| Route | Purpose |
| --- | --- |
| `/` | Name and email identity form |
| `/projects` | Owned projects, empty state, status pills, five-segment progress |
| `/projects/new` | Project title plus paste text or `.txt` upload |
| `/projects/[id]` | Full book text, stepper, current action, style, character cards, chapter card, progress/error/recovery states |
| `/api/session` | Create or resume the user and set an opaque HTTP-only session cookie |
| `/api/projects` | List and create projects |
| `/api/projects/[id]` | Return one owned project and all persisted results |
| `/api/projects/[id]/steps/[step]` | Atomically claim and execute the next step |
| `/api/projects/[id]/recover` | Mark only a genuinely stale running step as interrupted |
| `/api/projects/[id]/media/[assetId]` | Resolve a stored asset, authorize project ownership, then stream it |

The project page polls its project endpoint only while a step is running. A 1.5–2 second interval is enough. Portrait calls run sequentially so they share image context, but each character row is updated immediately; polling makes each portrait appear independently.

### Persistent data model

Keep pipeline position separate from execution state:

- `Project.completedStep`: integer `0..5`
- `Project.activeStep`: nullable step name
- `Project.stepState`: `IDLE | RUNNING | FAILED`
- `Project.stepStartedAt` and `Project.lastError`

Derive the list status instead of storing another source of truth:

- Draft: `completedStep = 0` and not running
- In progress: a step is running or `completedStep` is `1..4`
- Done: `completedStep = 5`

Main records:

- `User`: id, normalized unique email, name, timestamps
- `Session`: random hashed token, user id, timestamps
- `Project`: owner, title, local book path, pipeline fields, style, Gemini file metadata, text interaction IDs, last image interaction ID
- `Character`: project, stable order, name, prompt, portrait path, item state, image interaction ID
- `Chapter`: project, stable order, name, prompt, illustration path, item state, image interaction ID

Store book content and binary images outside the database. Do not put generated files in `public/`; the media endpoint must verify the current user owns the project.

### No-duplicate and recovery behavior

The step POST handler first performs a short SQLite transaction:

1. Verify project ownership and that the requested step equals `completedStep + 1`.
2. Atomically change `IDLE` or `FAILED` to `RUNNING` and set the active step and start time.
3. If the row is already running, return the existing state without calling Gemini.
4. Execute Gemini outside the transaction and checkpoint every external result immediately.
5. On success, increment `completedStep` and return to `IDLE`. On error, retain completed results and mark only this step `FAILED`.

Configure the Gemini client for one attempt and do not wrap calls in an automatic retry loop. Rate limits and transient API failures become a visible failed state; only the user's retry action may spend quota again.

The UI never decides whether work is allowed; it only reflects server state. Disable the button for usability, but rely on the transaction for correctness across tabs.

Treat a running step as recoverable only after a conservative timeout, initially 10 minutes and configurable with `STEP_STALE_AFTER_MS`. Recovery never automatically calls Gemini: it changes the state to failed/interrupted, after which the user explicitly retries. On retry, portraits skip any character that already has a saved image, so a failure on portrait 2 does not regenerate portrait 1.

Exactly-once execution cannot be guaranteed if the process dies after Gemini accepts a request but before the result is persisted because Gemini does not provide a transactional boundary with SQLite. Document this honest limit in `DECISIONS.md`; the application still prevents normal duplicate clicks, refreshes, and overlapping requests.

## Gemini pipeline mapping

Before coding, run the required notebook in Colab with the chosen models. Save concise notes or prompts in `docs/` as evidence, without committing the key or copyrighted book text.

### Step 1: Style

On the first explicit step action only:

1. Upload the saved `.txt` file with the Gemini File API and persist its URI/name.
2. Create the initial text interaction containing the uploaded document and persist its ID.
3. Chain the style interaction from the book interaction. If the user supplied a style, tell Gemini to retain it; otherwise ask Gemini to propose one.
4. Persist the style and style interaction ID.

Retry from the latest saved checkpoint rather than uploading the complete book again.

### Step 2: Characters

Chain from the style interaction. Request structured JSON objects with `name` and a detailed `prompt`, explicitly restricted to adults. Define `maxItems: 2` in the response schema, then validate and cap again in server code before inserting records.

### Step 3: Portraits

Create or resume a separate image interaction containing the project title, persisted style, and negative instructions such as no text, cover layout, borders, or multiple panels. Generate portraits sequentially, chaining each call from the previous image interaction. Save the decoded image atomically to the project directory, then checkpoint the item and interaction ID before starting the next portrait.

### Step 4: Chapters

Chain the text request from the character-prompt interaction, not from the image chain. Request structured `name` and `prompt` output that names and reuses established character descriptions. Define `maxItems: 1`, validate it, and persist only one server-side.

### Step 5: Illustrations

Resume the image interaction after the last portrait and tell it to use the earlier character portraits for consistency. Generate the single chapter scene, save it locally, checkpoint it, and mark the project complete.

Keep the text and image interaction IDs in the database so every later call resumes the correct conversation after a refresh or server restart.

## Implementation order and commit checkpoints

### 0. Explore and pin the contract — 1 hour

- Initialize the Git repository immediately, add a safe `.gitignore`, and make this plan the first project-history commit before implementation starts.
- Run the notebook through the chapter illustration with the real key.
- Click every state in `app-demo.html` and note its behavior and responsive layout.
- Record the chosen models, observed response shapes, approximate durations, and API limitations.
- Commit: `docs: capture assessment plan and Gemini pipeline notes`

### 1. Scaffold and test harness — 1.5 hours

- Create the Next.js TypeScript app, linting, formatting, Vitest, and React Testing Library.
- Add `.env.example`, `.gitignore`, `start.sh`, and `test.sh` early.
- Add the SQLite schema, filesystem helpers, and a `GeminiGateway` interface with real and fake implementations.
- Commit: `chore: scaffold Next.js app and test harness`

### 2. Identity and projects — 2 hours

- Implement opaque cookie sessions, identity upsert, sign out, and ownership checks.
- Implement project list/create/detail APIs and filesystem-safe `.txt` or pasted-text storage.
- Add server validation for normalized email, title, nonempty plain text, extension/type, and a documented size limit.
- Commit: `feat: add identity and persistent projects`

### 3. Pipeline state machine first — 1.5 hours

- Write backend tests for ordering, atomic claim, duplicate rejection, failed-step retry, stale recovery, caps, and partial portrait resume.
- Implement the state transition service until those tests pass.
- Commit: `feat: enforce resumable pipeline execution`

### 4. Gemini adapter and five steps — 4 hours

- Implement file upload, interaction chaining, structured output, and image extraction behind the gateway.
- Implement steps one by one, checkpointing interaction IDs and item results.
- Run the happy path first with the fake adapter, then once with the real API and a short public-domain sample.
- Commit separately where practical, for example text pipeline, portraits, then chapter illustration.
- Example commits: `feat: add chained Gemini text pipeline`; `feat: generate and persist character artwork`

### 5. UI and live states — 3 hours

- Build the identity, project list, new project, and detail screens.
- Match or exceed the demo's hierarchy, spacing, status visibility, responsive behavior, keyboard focus, and lack of layout shifts.
- Add named running states, per-character placeholders/progress, failure retry, stale recovery, full book reader, and sign out.
- Commit: `feat: build responsive illustration workflow UI`

### 6. Tests and ugly paths — 1.5 hours

- Add frontend tests for project-list empty/status states and project-step loading/error/stale states.
- Add one mocked integration test that completes all five steps without quota usage.
- Manually exercise double-click, two tabs, refresh during a portrait, server restart, failed second portrait, unauthorized media, bad upload, and mobile layout.
- Run the real test command and paste its actual output into `TESTING.md`.
- Commit: `test: cover pipeline and critical UI states`

### 7. Documentation and final quality pass — 1.5 hours

- Finish `README.md`, `TESTING.md`, and 4–6 genuine entries in `DECISIONS.md`.
- Ensure at least three decision entries describe specific AI suggestions that were rejected or corrected. Write these when they happen; do not fabricate them at the end.
- Include who proposed each choice, the pushback, the final choice, and its cost. End with the one-more-day answer.
- Verify a clean clone can start with one command and test with one command.
- Confirm no key, uploaded book, database, or generated binary is tracked.
- Commit: `docs: add setup testing and engineering decisions`

## Required tests

Backend/domain tests:

- Cannot claim step 2 before step 1 succeeds.
- Two simultaneous claims produce one winner and one existing-running response.
- A normal running step cannot be reclaimed.
- A stale step can be marked interrupted, but no retry starts automatically.
- Failure preserves completed step data and retry targets the same step.
- Retrying portraits skips already completed items.
- More than 2 model-returned characters and more than 1 chapter are capped server-side.
- Users cannot read another user's project, text, or images.

Frontend tests:

- Project list renders an empty state and correct Draft/In progress/Done states.
- Detail action changes among ready, named-running, failed/retry, stale/recover, and complete.
- Character cards show mixed completed and generating portrait states without hiding completed images.

Mocked integration test:

- Create a user and project, execute all five steps against the fake gateway, verify persisted text/image artifacts and final `completedStep = 5`, then reload and verify the same results remain.

## Documentation and AI evidence checklist

- `README.md`: prerequisites, environment variables, one start command, one test command, local-only note, short architecture overview
- `DECISIONS.md`: stack/storage, pipeline model, duplicate prevention, Gemini context strategy, model/cost choice, at least three genuine AI overrides, one-more-day answer
- `TESTING.md`: meaningful frontend/backend scope, deliberate omissions, manual checks, and unedited output from a real test run
- `docs/plan.md`: this plan
- `docs/gemini-notes.md` or saved prompts: observations from personally running the notebook
- Small commits throughout, with an honest AI co-author note in commit bodies where appropriate

## Definition of done

- All five real Gemini steps work in order with 2/1 server caps.
- The whole book is sent once and later text calls chain from persisted interaction IDs.
- Refresh, second tab, and double-click do not create overlapping calls.
- Individual portraits appear as they complete and survive reloads.
- Failure and stale-step recovery work without erasing completed results or auto-retrying Gemini.
- Every project, book file, and image is owner-isolated.
- Frontend and backend tests pass through the documented one-line command.
- A clean local start works through the documented one-line command.
- Required documentation and real AI artifacts are committed, while secrets and runtime data are ignored.

## References checked

- Assessment brief: `gradion-assessment-intern-software-engineer.md`
- Bundled behavior reference: `app-demo.html`
- Required notebook: <https://github.com/google-gemini/cookbook/blob/main/examples/Book_illustration.ipynb>
- Gemini image generation: <https://ai.google.dev/gemini-api/docs/image-generation>
- Gemini rate limits: <https://ai.google.dev/gemini-api/docs/rate-limits>
