import type { Client, InStatement, Row } from "@libsql/client/web";
import type {
  InsertThought,
  SimilarRow,
  StatsResult,
  Thought,
  ThoughtRepository,
  VectorSearchResult,
} from "../repository";

function statusClause(alias?: string, includeSuperseded?: boolean): string {
  const col = alias ? `${alias}.status` : "status";
  return includeSuperseded ? `${col} != 'deleted'` : `${col} = 'active'`;
}

function embeddingToJson(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

function safeParseArray(value: unknown): string[] {
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseThoughtRow(row: Row): Thought {
  return {
    id: row.id as string,
    content: row.content as string,
    type: row.type as string,
    topics: safeParseArray(row.topics),
    people: safeParseArray(row.people),
    created_at: row.created_at as string,
  };
}

export class TursoThoughtRepository implements ThoughtRepository {
  constructor(private db: Client) {}

  private insertStatements(thought: InsertThought): InStatement[] {
    const embeddingJson = embeddingToJson(thought.embedding);
    return [
      {
        sql: `INSERT INTO thoughts (id, content, embedding, type, topics, people, action_items)
              VALUES (:id, :content, vector(:embedding), :type, :topics, :people, :action_items)`,
        args: {
          id: thought.id,
          content: thought.content,
          embedding: embeddingJson,
          type: thought.type,
          topics: JSON.stringify(thought.topics),
          people: JSON.stringify(thought.people),
          action_items: JSON.stringify(thought.action_items),
        },
      },
      {
        sql: `INSERT INTO thought_fts (rowid, content)
              SELECT rowid, content FROM thoughts WHERE id = :id`,
        args: { id: thought.id },
      },
    ];
  }

  async insert(thought: InsertThought): Promise<void> {
    await this.db.batch(this.insertStatements(thought), "write");
  }

  async insertAndSupersede(
    thought: InsertThought,
    supersedesId: string,
  ): Promise<void> {
    const statements: InStatement[] = [
      ...this.insertStatements(thought),
      {
        sql: `UPDATE thoughts SET status = 'superseded', superseded_by = :newId, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = :oldId`,
        args: { newId: thought.id, oldId: supersedesId },
      },
      {
        sql: `DELETE FROM thought_fts WHERE rowid = (SELECT rowid FROM thoughts WHERE id = :id)`,
        args: { id: supersedesId },
      },
    ];

    await this.db.batch(statements, "write");
  }

  async vectorSearch(
    embedding: number[],
    options: { limit: number; includeSuperseded?: boolean },
  ): Promise<VectorSearchResult[]> {
    const embeddingJson = embeddingToJson(embedding);
    const result = await this.db.execute({
      sql: `SELECT id, content, type, topics, people, created_at,
              vector_distance_cos(embedding, vector(:embedding)) as distance
            FROM thoughts
            WHERE ${statusClause(undefined, options.includeSuperseded)}
            ORDER BY vector_distance_cos(embedding, vector(:embedding))
            LIMIT :limit`,
      args: { embedding: embeddingJson, limit: options.limit },
    });

    return result.rows.map((row) => ({
      ...parseThoughtRow(row),
      distance: row.distance as number,
    }));
  }

  async ftsSearch(
    query: string,
    options: { limit: number; includeSuperseded?: boolean },
  ): Promise<Thought[]> {
    const result = await this.db.execute({
      sql: `SELECT t.id, t.content, t.type, t.topics, t.people, t.created_at
            FROM thought_fts f
            JOIN thoughts t ON f.rowid = t.rowid
            WHERE thought_fts MATCH :query AND ${statusClause("t", options.includeSuperseded)}
            ORDER BY rank
            LIMIT :limit`,
      args: { query, limit: options.limit },
    });

    return result.rows.map(parseThoughtRow);
  }

  async findSimilarActive(
    embedding: number[],
    limit: number,
  ): Promise<SimilarRow[]> {
    const embeddingJson = embeddingToJson(embedding);
    const result = await this.db.execute({
      sql: `SELECT id, content, vector_distance_cos(embedding, vector(:embedding)) as distance
            FROM thoughts
            WHERE status = 'active'
            ORDER BY vector_distance_cos(embedding, vector(:embedding))
            LIMIT :limit`,
      args: { embedding: embeddingJson, limit },
    });

    return result.rows.map((row) => ({
      id: row.id as string,
      content: row.content as string,
      distance: row.distance as number,
    }));
  }

  async browse(options: {
    limit: number;
    type?: string;
    includeSuperseded?: boolean;
  }): Promise<Thought[]> {
    const status = statusClause(undefined, options.includeSuperseded);
    const typeClause = options.type ? "AND type = :type" : "";

    const result = await this.db.execute({
      sql: `SELECT id, content, type, topics, people, created_at
            FROM thoughts
            WHERE ${status} ${typeClause}
            ORDER BY created_at DESC
            LIMIT :limit`,
      args: {
        limit: options.limit,
        ...(options.type ? { type: options.type } : {}),
      },
    });

    return result.rows.map(parseThoughtRow);
  }

  async softDelete(id: string): Promise<boolean> {
    const results = await this.db.batch(
      [
        {
          sql: `UPDATE thoughts
                SET status = 'deleted', deleted_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
                WHERE id = :id AND status != 'deleted'`,
          args: { id },
        },
        {
          sql: `DELETE FROM thought_fts WHERE rowid = (SELECT rowid FROM thoughts WHERE id = :id)`,
          args: { id },
        },
      ],
      "write",
    );

    return results[0].rowsAffected > 0;
  }

  async stats(): Promise<StatsResult> {
    const [totalResult, typeResult, supersededResult, recentResult] =
      await Promise.all([
        this.db.execute(
          "SELECT COUNT(*) as count FROM thoughts WHERE status = 'active'",
        ),
        this.db.execute(
          "SELECT type, COUNT(*) as count FROM thoughts WHERE status = 'active' GROUP BY type",
        ),
        this.db.execute(
          "SELECT COUNT(*) as count FROM thoughts WHERE status = 'superseded'",
        ),
        this.db.execute(
          "SELECT created_at FROM thoughts WHERE status = 'active' ORDER BY created_at DESC LIMIT 1",
        ),
      ]);

    const byType: Record<string, number> = {};
    for (const row of typeResult.rows) {
      byType[row.type as string] = row.count as number;
    }

    return {
      total: totalResult.rows[0].count as number,
      byType,
      superseded: supersededResult.rows[0].count as number,
      mostRecent:
        recentResult.rows.length > 0
          ? (recentResult.rows[0].created_at as string)
          : null,
    };
  }
}
