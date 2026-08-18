<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project subagent workflow

Project-scoped custom agents live in `.codex/agents/`:

- `backend` owns persistence, API routes, Gemini integration, concurrency, and backend tests.
- `frontend` owns screens, client state, responsive UI, accessibility, and frontend tests.
- `reviewer` is read-only and audits the integrated result against the assessment.

For work that cleanly spans backend and frontend, delegate the independent scopes to `backend` and `frontend` in parallel. Avoid assigning the same file to both agents; shared files such as `package.json`, lockfiles, API contracts, and documentation remain owned by the parent unless it explicitly assigns one owner. After integration and verification, run `reviewer` and resolve its blocking findings before any commit or push.

Agents must not commit or push. The parent agent owns integration, final verification, Git history, and all external publication. Never push without the user's explicit approval in the current conversation.
