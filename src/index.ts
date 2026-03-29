import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { handleAccessRequest } from "./auth/access-handler";
import type { Props } from "./auth/types";
import { createClient } from "./services/db";
import { createOpenAIChatModel, createOpenAIEmbedder } from "./services/openai";
import {
  handler as browseHandler,
  schema as browseSchema,
} from "./tools/browse";
import {
  handler as forgetHandler,
  schema as forgetSchema,
} from "./tools/forget";
import {
  handler as recallHandler,
  schema as recallSchema,
} from "./tools/recall";
import {
  handler as rememberHandler,
  schema as rememberSchema,
} from "./tools/remember";
import { handler as statsHandler } from "./tools/stats";

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
    const required = [
      "OPENAI_API_KEY",
      "TURSO_URL",
      "TURSO_AUTH_TOKEN",
    ] as const;
    for (const key of required) {
      if (!this.env[key]) {
        throw new Error(`Missing required environment variable: ${key}`);
      }
    }

    const db = createClient(this.env.TURSO_URL, this.env.TURSO_AUTH_TOKEN);
    const embedder = createOpenAIEmbedder(this.env.OPENAI_API_KEY);
    const chat = createOpenAIChatModel(this.env.OPENAI_API_KEY);

    this.server.tool(
      "remember",
      "Store a thought. The server handles embedding, metadata extraction, deduplication, and superseding automatically.",
      rememberSchema,
      (args) => rememberHandler({ embedder, chat }, db, args),
    );

    this.server.tool(
      "recall",
      "Search memories by meaning and keyword. Runs hybrid semantic + full-text search and returns ranked results.",
      recallSchema,
      (args) => recallHandler({ embedder }, db, args),
    );

    this.server.tool(
      "browse",
      "List recent thoughts in chronological order.",
      browseSchema,
      (args) => browseHandler(db, args),
    );

    this.server.tool(
      "forget",
      "Soft-delete a thought by ID.",
      forgetSchema,
      (args) => forgetHandler(db, args),
    );

    this.server.tool(
      "stats",
      "Overview of the memory store — total count, breakdown by type, superseded count, and most recent capture timestamp.",
      {},
      () => statsHandler(db),
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
