import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { z } from "zod";
import { handleAccessRequest } from "./auth/access-handler";
import type { Props } from "./auth/types";
import { createClient } from "./services/db";
import { browse as browseTool } from "./tools/browse";
import { forget as forgetTool } from "./tools/forget";
import { recall as recallTool } from "./tools/recall";
import { remember as rememberTool } from "./tools/remember";
import { stats as statsTool } from "./tools/stats";

export interface Env {
  OPENAI_API_KEY: string;
  TURSO_URL: string;
  TURSO_AUTH_TOKEN: string;
  OAUTH_KV: KVNamespace;
  ACCESS_CLIENT_ID: string;
  ACCESS_CLIENT_SECRET: string;
  ACCESS_TOKEN_URL: string;
  ACCESS_AUTHORIZATION_URL: string;
  ACCESS_JWKS_URL: string;
  MCP_OBJECT: DurableObjectNamespace<MemoryMCP>;
}

export class MemoryMCP extends McpAgent<Env, Record<string, never>, Props> {
  server = new McpServer({
    name: "Memory",
    version: "0.1.0",
  });

  async init() {
    this.server.tool(
      "remember",
      "Store a thought. The server handles embedding, metadata extraction, deduplication, and superseding automatically.",
      {
        content: z
          .string()
          .describe("The thought to remember, in natural language."),
      },
      async ({ content }) => {
        const db = createClient(this.env);
        const result = await rememberTool(this.env, db, content);

        const parts = [`Remembered (${result.id}): ${result.type}`];
        if (result.topics.length > 0)
          parts.push(`Topics: ${result.topics.join(", ")}`);
        if (result.people.length > 0)
          parts.push(`People: ${result.people.join(", ")}`);
        if (result.action_items.length > 0)
          parts.push(`Action items: ${result.action_items.join("; ")}`);
        if (result.superseded)
          parts.push(
            `Superseded ${result.superseded.id}: ${result.superseded.reason}`,
          );

        return { content: [{ type: "text", text: parts.join("\n") }] };
      },
    );

    this.server.tool(
      "recall",
      "Search memories by meaning and keyword. Runs hybrid semantic + full-text search and returns ranked results.",
      {
        query: z.string().describe("Natural language search query."),
        limit: z
          .number()
          .min(1)
          .max(50)
          .default(10)
          .describe("Maximum results to return."),
      },
      async ({ query, limit }) => {
        const db = createClient(this.env);
        const results = await recallTool(this.env, db, { query, limit });

        if (results.length === 0) {
          return {
            content: [{ type: "text", text: "No matching memories found." }],
          };
        }

        const text = results
          .map((r) => {
            const parts = [`[${r.id}] (${r.type}) ${r.content}`];
            if (r.similarity !== null)
              parts.push(`  similarity: ${(r.similarity * 100).toFixed(1)}%`);
            if (r.topics.length > 0)
              parts.push(`  topics: ${r.topics.join(", ")}`);
            if (r.stale) parts.push("  ⚠ stale — consider reviewing");
            return parts.join("\n");
          })
          .join("\n\n");

        return { content: [{ type: "text", text }] };
      },
    );

    this.server.tool(
      "browse",
      "List recent thoughts in chronological order.",
      {
        limit: z
          .number()
          .min(1)
          .max(100)
          .default(20)
          .describe("Maximum results to return."),
        type: z
          .string()
          .optional()
          .describe("Optional filter by thought type."),
      },
      async ({ limit, type }) => {
        const db = createClient(this.env);
        const results = await browseTool(db, { limit, type });

        if (results.length === 0) {
          return {
            content: [{ type: "text", text: "No thoughts stored yet." }],
          };
        }

        const text = results
          .map((r) => {
            const parts = [`[${r.id}] (${r.type}) ${r.content}`];
            if (r.topics.length > 0)
              parts.push(`  topics: ${r.topics.join(", ")}`);
            parts.push(`  created: ${r.created_at}`);
            return parts.join("\n");
          })
          .join("\n\n");

        return { content: [{ type: "text", text }] };
      },
    );

    this.server.tool(
      "forget",
      "Soft-delete a thought by ID.",
      { id: z.string().describe("The thought ID to forget.") },
      async ({ id }) => {
        const db = createClient(this.env);
        const deleted = await forgetTool(db, id);

        const text = deleted
          ? `Forgotten: ${id}`
          : `No active thought found with ID "${id}".`;

        return { content: [{ type: "text", text }] };
      },
    );

    this.server.tool(
      "stats",
      "Overview of the memory store — total count, breakdown by type, superseded count, and most recent capture timestamp.",
      {},
      async () => {
        const db = createClient(this.env);
        const result = await statsTool(db);

        const parts = [`Total active: ${result.total}`];
        if (Object.keys(result.byType).length > 0) {
          const breakdown = Object.entries(result.byType)
            .map(([t, count]) => `${t}: ${count}`)
            .join(", ");
          parts.push(`By type: ${breakdown}`);
        }
        parts.push(`Superseded: ${result.superseded}`);
        parts.push(`Most recent: ${result.mostRecent ?? "none"}`);

        return { content: [{ type: "text", text: parts.join("\n") }] };
      },
    );
  }
}

export default new OAuthProvider({
  apiRoute: "/mcp",
  apiHandler: MemoryMCP.serve("/mcp"),
  defaultHandler: {
    fetch: handleAccessRequest as (
      request: Request,
      env: Env,
      ctx: ExecutionContext,
    ) => Promise<Response>,
  },
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  clientRegistrationEndpoint: "/register",
});
