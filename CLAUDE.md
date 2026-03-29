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
│   ├── services/
│   │   ├── llm.ts
│   │   ├── openai.ts
│   │   ├── turso.ts
│   │   └── supersede.ts
│   └── schema.sql
├── docs/
│   ├── vision.md
│   └── principles.md
├── wrangler.toml
├── package.json
└── tsconfig.json
```

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
