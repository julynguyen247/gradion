# API Contract

This is the integration contract between the backend and frontend agents. Runtime errors use `{ "error": { "code": string, "message": string } }`.

## Session

- `GET /api/session` → `{ "user": User | null }`
- `POST /api/session` with `{ "name": string, "email": string }` → `{ "user": User }`
- `DELETE /api/session` → `204`

`User` contains `id`, `name`, and `email`.

## Projects

- `GET /api/projects` → `{ "projects": ProjectSummary[] }`
- `POST /api/projects` as multipart form data with `title`, optional `text`, and optional `.txt` `file` → `{ "project": ProjectDetail }`
- `GET /api/projects/:id` → `{ "project": ProjectDetail }`

`ProjectSummary` contains:

- `id`, `title`, and ISO `createdAt`
- derived `status`: `DRAFT | IN_PROGRESS | DONE`
- `completedStep`: integer from 0 through 5
- `activeStep`: `STYLE | CHARACTERS | PORTRAITS | CHAPTERS | ILLUSTRATIONS | null`
- `stepState`: `IDLE | RUNNING | FAILED`

`ProjectDetail` adds:

- full `bookText`
- `style: string | null`
- `stepStartedAt: ISO string | null`
- `lastError: string | null`
- `canRecover: boolean`
- `characters: Character[]`
- `chapters: Chapter[]`

`Character` contains `id`, `name`, `prompt`, `state`, and `portraitUrl`. `Chapter` contains `id`, `name`, `prompt`, `state`, and `illustrationUrl`. Item state is `PENDING | RUNNING | DONE | FAILED`; media URLs are nullable and already point at an ownership-checking API route.

## Pipeline actions

- `POST /api/projects/:id/steps/:step`, where `step` is lowercase `style`, `characters`, `portraits`, `chapters`, or `illustrations`
- Style accepts optional JSON `{ "style": string }`; other steps need no body.
- A completed synchronous call returns `200` with `{ "project": ProjectDetail }`.
- A duplicate request for existing work returns `202` with `{ "project": ProjectDetail, "alreadyRunning": true }` and never calls Gemini again.
- Validation/order/conflict errors use the standard error body with an appropriate 4xx status.
- `POST /api/projects/:id/recover` marks only a stale running step as failed/interrupted and returns `{ "project": ProjectDetail }`. It does not call Gemini.

The project detail client polls only while `stepState` is `RUNNING`. It uses `canRecover` rather than calculating a stale timeout in the browser.
