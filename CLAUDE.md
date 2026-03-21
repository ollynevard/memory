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
