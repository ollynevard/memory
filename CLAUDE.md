# CLAUDE.md

A remote MCP server that gives AI agents persistent, semantic memory. Cloudflare Workers + Turso + OpenAI.

## Key Docs

- [docs/vision.md](docs/vision.md) — what this project is and why it exists
- [docs/principles.md](docs/principles.md) — engineering principles to follow

## Stack

- **Runtime:** Cloudflare Workers (TypeScript)
- **Database:** Turso (hosted SQLite with sqlite-vec + FTS5)
- **Embeddings & metadata:** OpenAI (text-embedding-3-small + gpt-4o-mini)
- **MCP framework:** @modelcontextprotocol/sdk + agents (Durable Object)
- **Auth:** OAuth 2.1 via @cloudflare/workers-oauth-provider + Cloudflare Access

## Project Structure

```
memory/
├── src/
│   ├── index.ts              ← OAuthProvider + MemoryMCP Durable Object
│   ├── auth/
│   │   ├── access-handler.ts ← Cloudflare Access OAuth flow
│   │   ├── jwt.ts            ← ID token verification
│   │   ├── state.ts          ← OAuth state management (KV)
│   │   └── types.ts          ← Auth prop types
│   ├── tools/
│   │   ├── remember.ts
│   │   ├── recall.ts
│   │   ├── browse.ts
│   │   ├── forget.ts
│   │   └── stats.ts
│   ├── repository.ts          ← ThoughtRepository interface + domain types
│   ├── services/
│   │   ├── db.ts              ← Turso client factory + ID generation
│   │   ├── llm.ts             ← Embedder + ChatModel interfaces
│   │   ├── openai.ts          ← OpenAI implementations + metadata extraction
│   │   ├── turso-repository.ts ← TursoThoughtRepository (all SQL lives here)
│   │   └── supersede.ts       ← Duplicate/supersede detection
│   └── schema.sql
├── docs/
│   ├── vision.md
│   └── principles.md
├── wrangler.toml
├── package.json
└── tsconfig.json
```

## Code Style

- **File ordering:** Types/interfaces first, then core logic, then schema/config, then handler/entrypoint
- **Exports:** Inline with declarations (`export function`, `export interface`), not gathered at the bottom
- **Comments:** JSDoc (`/** */`) on all public interface methods for consistency. Don't add comments that narrate code history or section-header banners — let git and file structure do that work
- **Stay idiomatic:** Write TypeScript, not Java-in-TypeScript. Avoid unnecessary abstractions, abstract base classes, or DI containers

## Branches

Conventional commit style. Ticket number is optional:

```
feat/mcp/T19-add-recall
refactor/services/extract-db-module
ci/biome/T23-add-linting
```

## Commits and PR Titles

Conventional commits. Ticket number in square brackets at the end is optional:

```
feat(mcp): add recall [T19]
ci(biome): add linting and formatting [T23]
refactor(services): extract db module
```

Types: feat, fix, refactor, test, chore, docs, perf, ci, build, style, revert

## Pull Requests

- **Title**: Same format as commits (see above)
- **Description**: Concise summary of what and why (not how)
- **Keep description updated**: Update the PR description when pushing new changes, where relevant
- **Merge strategy**: Squash and merge to keep `main` history clean
- Keep PRs small and focused — easier to review and revert if needed
