import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { LIMITS, SIMILARITY, STALENESS_DAYS } from "../constants";
import type { ThoughtRepository } from "../repository";
import type { Embedder } from "../services/llm";
import { timed } from "../services/logger";

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
  createdAt: string;
  stale: boolean;
}

const STALENESS_BY_TYPE: Record<string, number> = {
  decision: STALENESS_DAYS.decision,
  task: STALENESS_DAYS.task,
};

function isStale(type: string, createdAt: string): boolean {
  const maxDays = STALENESS_BY_TYPE[type] ?? STALENESS_DAYS.DEFAULT;
  const age = Date.now() - new Date(createdAt).getTime();
  return age > maxDays * 24 * 60 * 60 * 1000;
}

export async function recall(
  embedder: Embedder,
  repo: ThoughtRepository,
  options: RecallOptions,
): Promise<RecallResult[]> {
  const limit = Math.min(
    Math.max(options.limit ?? LIMITS.RECALL_DEFAULT, 1),
    LIMITS.RECALL_MAX,
  );
  const threshold = options.threshold ?? SIMILARITY.RECALL_DEFAULT;
  // 1. Embed query
  const queryEmbedding = await timed("embed", () =>
    embedder.embed(options.query),
  );

  // 2. Run semantic and FTS search in parallel
  const searchOpts = { limit, includeSuperseded: options.includeSuperseded };
  const [vectorResults, ftsResults] = await timed("db_search", () =>
    Promise.all([
      repo.vectorSearch(queryEmbedding, searchOpts),
      repo.ftsSearch(options.query, searchOpts),
    ]),
  );

  // 3. Merge and deduplicate by thought ID
  const seen = new Map<string, RecallResult>();

  for (const row of vectorResults) {
    const similarity = 1 - row.distance;
    if (similarity < threshold) continue;

    seen.set(row.id, {
      id: row.id,
      content: row.content,
      type: row.type,
      topics: row.topics,
      people: row.people,
      createdAt: row.createdAt,
      similarity,
      stale: isStale(row.type, row.createdAt),
    });
  }

  for (const row of ftsResults) {
    if (seen.has(row.id)) continue;

    seen.set(row.id, {
      ...row,
      similarity: null,
      stale: isStale(row.type, row.createdAt),
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
    .max(LIMITS.RECALL_MAX)
    .default(LIMITS.RECALL_DEFAULT)
    .describe("Maximum results to return."),
};

export interface RecallDeps {
  embedder: Embedder;
}

export async function handler(
  deps: RecallDeps,
  repo: ThoughtRepository,
  { query, limit }: { query: string; limit: number },
): Promise<CallToolResult> {
  if (query.length > LIMITS.RECALL_QUERY) {
    return {
      content: [
        { type: "text", text: "Query too long. Maximum 10,000 characters." },
      ],
      isError: true,
    };
  }

  try {
    const results = await recall(deps.embedder, repo, { query, limit });

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
