import type { Client } from "@libsql/client/web";

export interface BrowseOptions {
  limit?: number;
  type?: string;
  includeSupereded?: boolean;
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
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
  const statusFilter = options.includeSupereded
    ? "status != 'deleted'"
    : "status = 'active'";

  const typeClause = options.type ? "AND type = :type" : "";

  const result = await db.execute({
    sql: `SELECT id, content, type, topics, people, created_at
          FROM thoughts
          WHERE ${statusFilter} ${typeClause}
          ORDER BY created_at DESC
          LIMIT :limit`,
    args: { limit, ...(options.type ? { type: options.type } : {}) },
  });

  return result.rows.map((row) => ({
    id: row.id as string,
    content: row.content as string,
    type: row.type as string,
    topics: JSON.parse((row.topics as string) ?? "[]"),
    people: JSON.parse((row.people as string) ?? "[]"),
    created_at: row.created_at as string,
  }));
}
