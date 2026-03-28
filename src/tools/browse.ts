import type { Client } from "@libsql/client/web";
import { parseThoughtRow, statusFilter } from "../services/db";

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
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
  const status = statusFilter(options.includeSuperseded);
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
