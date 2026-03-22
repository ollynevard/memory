# CLAUDE.md

A remote MCP server that gives AI agents persistent, semantic memory. Cloudflare Workers + Turso + OpenAI.

## Key Docs

- [docs/vision.md](docs/vision.md) — what this project is and why it exists
- [docs/principles.md](docs/principles.md) — engineering principles to follow

## Stack

- **Runtime:** Cloudflare Workers (TypeScript)
- **Database:** Turso (hosted SQLite with sqlite-vec + FTS5)
- **Embeddings & metadata:** OpenAI (text-embedding-3-small + gpt-4o-mini)
- **MCP framework:** workers-mcp

## Project Structure

```
memory/
├── src/
│   ├── index.ts              ← MCP server entry point
│   ├── tools/
│   │   ├── remember.ts
│   │   ├── recall.ts
│   │   ├── browse.ts
│   │   ├── forget.ts
│   │   └── stats.ts
│   ├── services/
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

## Commits and PR Titles

Conventional commits with ticket number in square brackets at the end:

```
feat(mcp): add recall [T19]
ci(biome): add linting and formatting [T23]
```

Types: feat, fix, refactor, test, chore, docs, perf, ci, build, style, revert

## Pull Requests

- **Title**: Same format as commits (see above)
- **Description**: Concise summary of what and why (not how)
- **Keep description updated**: Update the PR description when pushing new changes, where relevant
- **Merge strategy**: Squash and merge to keep `main` history clean
- Keep PRs small and focused — easier to review and revert if needed
