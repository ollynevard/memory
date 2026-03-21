# Engineering Principles

Guidelines for building and evolving this project.

## 1. The server is the smart layer

Clients send raw text. All intelligence — embedding, metadata extraction, dedup, superseding — happens server-side. This means any MCP client gets the full experience without coupling to the schema or needing its own prompts.

## 2. Thoughts are immutable

Thoughts don't get edited. When something changes, a new thought is captured and the old one is automatically superseded. This preserves history and makes the supersede chain traceable.

## 3. Soft delete everything

Nothing is hard-deleted. `forget` sets a status flag. This keeps the door open for undo, audit, and future synthesis without complicating the happy path.

## 4. Hybrid search by default

Semantic search catches meaning. Full-text search catches exact names and keywords. Both run in parallel and results are merged. Neither alone is sufficient.

## 5. Free tier as a constraint

The stack should run on free tiers — Cloudflare Workers, Turso, and minimal OpenAI spend. This is a personal tool, not a SaaS product. Cost pressure keeps the architecture simple.

## 6. One tool, one job

Each MCP tool does exactly one thing. `remember` captures. `recall` searches. `browse` lists. `forget` deletes. `stats` summarises. Composition happens in the client, not in overloaded tool parameters.

## 7. Fail loud, not silent

If an OpenAI call fails, the thought isn't stored. If dedup can't run, the capture is rejected. No partial writes, no optimistic fallbacks that hide broken state. The user should always know what happened.

## 8. Keep the schema minimal

One table for thoughts, one for embeddings, one for full-text search. Resist the urge to add tables until there's a concrete use case. JSON columns (topics, people, action_items) handle variable metadata without schema migrations.

## 9. Ship small, verify, iterate

Each task in the build plan is independently deployable and testable. Don't batch work into large PRs. Deploy after each piece, verify it works, then move on.
