# Gradion Illustration Studio

A local full-stack application that turns a book into an art direction, two adult character portraits, and one chapter illustration through a user-driven Gemini pipeline.

## Prerequisites

- Node.js 22 or newer (verified with Node.js 26)
- npm
- A Gemini API key with access to the configured text and Nano Banana image models

## Start

Copy the environment template and add your Gemini key:

```bash
cp .env.example .env.local
```

Then start the complete stack with one command:

```bash
./start.sh
```

Open <http://localhost:3000>. The application is intentionally local-only and should not be publicly deployed with a personal Gemini key.

## Test

Run all backend and frontend tests with one command:

```bash
./test.sh
```

Additional checks:

```bash
npm run lint
npx tsc --noEmit
npm run build
```

## Environment variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `GEMINI_API_KEY` | Required for real pipeline calls | none |
| `GEMINI_TEXT_MODEL` | Current Interactions-compatible text model | `gemini-3.6-flash` |
| `GEMINI_IMAGE_MODEL` | Current Nano Banana image model | `gemini-3.1-flash-image` |
| `DATABASE_PATH` | SQLite database location | `data/gradion.db` |
| `DATA_ROOT` | Private book and image storage | `data/files` |
| `STEP_STALE_AFTER_MS` | Time before a running step can be recovered | `600000` |
| `SESSION_TTL_MS` | Opaque session lifetime | `2592000000` |

## Architecture

The application is one Next.js App Router process. Route handlers provide identity, project, pipeline, recovery, and authorized-media APIs. SQLite stores users, hashed sessions, project progress, Gemini interaction IDs, and generated metadata. Book text and generated images remain on the local filesystem outside `public/`.

Each pipeline action atomically claims the project row before calling Gemini. The text conversation chains book → style → characters → chapter; a separate image conversation chains the two portraits → chapter illustration. Completed items are checkpointed immediately, the server enforces the two-character/one-chapter caps, and the browser polls only while work is running.

The repository does not need Docker or a separate database service. See [docs/plan.md](docs/plan.md), [docs/api-contract.md](docs/api-contract.md), [DECISIONS.md](DECISIONS.md), and [TESTING.md](TESTING.md) for the implementation rationale and verification record.
