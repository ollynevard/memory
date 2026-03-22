import type { Client } from "@libsql/client/web";
import type { Env } from "../index";
import { embed } from "../services/openai";

export interface RecallOptions {
  query: string;
  limit?: number;
  threshold?: number;
  includeSupereded?: boolean;
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
  env: Env,
  db: Client,
  options: RecallOptions,
): Promise<RecallResult[]> {
  const limit = Math.min(Math.max(options.limit ?? 10, 1), 50);
  const threshold = options.threshold ?? 0.7;
  const statusFilter = options.includeSupereded
    ? "status != 'deleted'"
    : "status = 'active'";

  // 1. Embed query
  const queryEmbedding = await embed(env, options.query);
  const embeddingJson = `[${queryEmbedding.join(",")}]`;

  // 2. Run semantic and FTS search in parallel
  const [vectorResults, ftsResults] = await Promise.all([
    db.execute({
      sql: `SELECT id, content, type, topics, people, created_at,
              vector_distance_cos(embedding, vector(:embedding)) as distance
            FROM thoughts
            WHERE ${statusFilter}
            ORDER BY vector_distance_cos(embedding, vector(:embedding))
            LIMIT :limit`,
      args: { embedding: embeddingJson, limit },
    }),
    db.execute({
      sql: `SELECT t.id, t.content, t.type, t.topics, t.people, t.created_at,
              rank as fts_rank
            FROM thought_fts f
            JOIN thoughts t ON f.rowid = t.rowid
            WHERE thought_fts MATCH :query AND t.${statusFilter}
            ORDER BY rank
            LIMIT :limit`,
      args: { query: options.query, limit },
    }),
  ]);

  // 3. Merge and deduplicate by thought ID
  const seen = new Map<string, RecallResult>();

  for (const row of vectorResults.rows) {
    const distance = row.distance as number;
    const similarity = 1 - distance;
    if (similarity < threshold) continue;

    const id = row.id as string;
    const type = row.type as string;
    const createdAt = row.created_at as string;

    seen.set(id, {
      id,
      content: row.content as string,
      type,
      topics: JSON.parse((row.topics as string) ?? "[]"),
      people: JSON.parse((row.people as string) ?? "[]"),
      similarity,
      created_at: createdAt,
      stale: isStale(type, createdAt),
    });
  }

  for (const row of ftsResults.rows) {
    const id = row.id as string;
    if (seen.has(id)) continue;

    const type = row.type as string;
    const createdAt = row.created_at as string;

    seen.set(id, {
      id,
      content: row.content as string,
      type,
      topics: JSON.parse((row.topics as string) ?? "[]"),
      people: JSON.parse((row.people as string) ?? "[]"),
      similarity: null,
      created_at: createdAt,
      stale: isStale(type, createdAt),
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
