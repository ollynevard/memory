import type { Client } from "@libsql/client/web";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  createClient,
  embeddingToJson,
  parseThoughtRow,
  statusFilter,
} from "../services/db";
import { timed } from "../services/logger";
import { embed } from "../services/openai";

export interface RecallOptions {
  query: string;
  limit?: number;
  threshold?: number;
  includeSuperseded?: boolean;
  filter?: { type?: string; topics?: string[] };
}

export interface RecallResult {
  id: string;
  content: string;
  type: string;
  topics: string[];
  people: string[];
  similarity: number | null;
  created_at: string;
  stale: boolean;
}

const STALENESS_DAYS: Record<string, number> = {
  decision: 180,
  task: 90,
};
const DEFAULT_STALENESS_DAYS = 365;

function isStale(type: string, createdAt: string): boolean {
  const maxDays = STALENESS_DAYS[type] ?? DEFAULT_STALENESS_DAYS;
  const age = Date.now() - new Date(createdAt).getTime();
  return age > maxDays * 24 * 60 * 60 * 1000;
}

export async function recall(
  apiKey: string,
  db: Client,
  options: RecallOptions,
): Promise<RecallResult[]> {
  const limit = Math.min(Math.max(options.limit ?? 10, 1), 50);
  const threshold = options.threshold ?? 0.7;
  const status = statusFilter(options.includeSuperseded);

  // 1. Embed query
  const queryEmbedding = await timed("embed", () =>
    embed(apiKey, options.query),
  );
  const embeddingJson = embeddingToJson(queryEmbedding);

  // 2. Run semantic and FTS search in parallel
  const [vectorResults, ftsResults] = await timed("db_search", () =>
    Promise.all([
      db.execute({
        sql: `SELECT id, content, type, topics, people, created_at,
                vector_distance_cos(embedding, vector(:embedding)) as distance
              FROM thoughts
              WHERE ${status}
              ORDER BY vector_distance_cos(embedding, vector(:embedding))
              LIMIT :limit`,
        args: { embedding: embeddingJson, limit },
      }),
      db.execute({
        sql: `SELECT t.id, t.content, t.type, t.topics, t.people, t.created_at,
                rank as fts_rank
              FROM thought_fts f
              JOIN thoughts t ON f.rowid = t.rowid
              WHERE thought_fts MATCH :query AND t.${status}
              ORDER BY rank
              LIMIT :limit`,
        args: { query: options.query, limit },
      }),
    ]),
  );

  // 3. Merge and deduplicate by thought ID
  const seen = new Map<string, RecallResult>();

  for (const row of vectorResults.rows) {
    const distance = row.distance as number;
    const similarity = 1 - distance;
    if (similarity < threshold) continue;

    const thought = parseThoughtRow(row);
    seen.set(thought.id, {
      ...thought,
      similarity,
      stale: isStale(thought.type, thought.created_at),
    });
  }

  for (const row of ftsResults.rows) {
    const id = row.id as string;
    if (seen.has(id)) continue;

    const thought = parseThoughtRow(row);
    seen.set(thought.id, {
      ...thought,
      similarity: null,
      stale: isStale(thought.type, thought.created_at),
    });
  }

  // 4. Apply filters
  let results = [...seen.values()];

  if (options.filter?.type) {
    results = results.filter((r) => r.type === options.filter?.type);
  }
  if (options.filter?.topics?.length) {
    const filterTopics = new Set(options.filter.topics);
    results = results.filter((r) => r.topics.some((t) => filterTopics.has(t)));
  }

  // 5. Sort: vector results first (by similarity desc), then FTS results
  results.sort((a, b) => {
    if (a.similarity !== null && b.similarity !== null)
      return b.similarity - a.similarity;
    if (a.similarity !== null) return -1;
    if (b.similarity !== null) return 1;
    return 0;
  });

  return results.slice(0, limit);
}

export const schema = {
  query: z.string().describe("Natural language search query."),
  limit: z
    .number()
    .min(1)
    .max(50)
    .default(10)
    .describe("Maximum results to return."),
};

export interface RecallEnv {
  OPENAI_API_KEY: string;
  TURSO_URL: string;
  TURSO_AUTH_TOKEN: string;
}

export async function handler(
  env: RecallEnv,
  { query, limit }: { query: string; limit: number },
): Promise<CallToolResult> {
  if (query.length > 10_000) {
    return {
      content: [
        { type: "text", text: "Query too long. Maximum 10,000 characters." },
      ],
      isError: true,
    };
  }

  try {
    const db = createClient(env.TURSO_URL, env.TURSO_AUTH_TOKEN);
    const results = await recall(env.OPENAI_API_KEY, db, { query, limit });

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
        if (r.topics.length > 0) parts.push(`  topics: ${r.topics.join(", ")}`);
        if (r.stale) parts.push("  ⚠ stale — consider reviewing");
        return parts.join("\n");
      })
      .join("\n\n");

    return { content: [{ type: "text", text }] };
  } catch (err) {
    console.error("recall failed:", err);
    return {
      content: [{ type: "text", text: "Search failed. Please try again." }],
      isError: true,
    };
  }
}
