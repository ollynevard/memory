import type { Client } from "@libsql/client/web";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { LIMITS } from "../constants";
import { createClient, parseThoughtRow, statusClause } from "../services/db";

export interface BrowseOptions {
  limit?: number;
  type?: string;
  includeSuperseded?: boolean;
}

export interface BrowseResult {
  id: string;
  content: string;
  type: string;
  topics: string[];
  people: string[];
  created_at: string;
}

export async function browse(
  db: Client,
  options: BrowseOptions,
): Promise<BrowseResult[]> {
  const limit = Math.min(
    Math.max(options.limit ?? LIMITS.BROWSE_DEFAULT, 1),
    LIMITS.BROWSE_MAX,
  );
  const status = statusClause(undefined, options.includeSuperseded);
  const typeClause = options.type ? "AND type = :type" : "";

  const result = await db.execute({
    sql: `SELECT id, content, type, topics, people, created_at
          FROM thoughts
          WHERE ${status} ${typeClause}
          ORDER BY created_at DESC
          LIMIT :limit`,
    args: { limit, ...(options.type ? { type: options.type } : {}) },
  });

  return result.rows.map(parseThoughtRow);
}

export const schema = {
  limit: z
    .number()
    .min(1)
    .max(LIMITS.BROWSE_MAX)
    .default(LIMITS.BROWSE_DEFAULT)
    .describe("Maximum results to return."),
  type: z.string().optional().describe("Optional filter by thought type."),
};

export interface BrowseEnv {
  TURSO_URL: string;
  TURSO_AUTH_TOKEN: string;
}

export async function handler(
  env: BrowseEnv,
  { limit, type }: { limit: number; type?: string },
): Promise<CallToolResult> {
  try {
    const db = createClient(env.TURSO_URL, env.TURSO_AUTH_TOKEN);
    const results = await browse(db, { limit, type });

    if (results.length === 0) {
      return {
        content: [{ type: "text", text: "No thoughts stored yet." }],
      };
    }

    const text = results
      .map((r) => {
        const parts = [`[${r.id}] (${r.type}) ${r.content}`];
        if (r.topics.length > 0) parts.push(`  topics: ${r.topics.join(", ")}`);
        parts.push(`  created: ${r.created_at}`);
        return parts.join("\n");
      })
      .join("\n\n");

    return { content: [{ type: "text", text }] };
  } catch (err) {
    console.error("browse failed:", err);
    return {
      content: [
        { type: "text", text: "Failed to browse thoughts. Please try again." },
      ],
      isError: true,
    };
  }
}
