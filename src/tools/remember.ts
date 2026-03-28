import type { Client, InStatement } from "@libsql/client/web";
import type { Env } from "../index";
import { embeddingToJson, generateId } from "../services/db";
import { embed, extractMetadata } from "../services/openai";
import { checkSupersede } from "../services/supersede";

export interface RememberResult {
  id: string;
  type: string;
  topics: string[];
  people: string[];
  action_items: string[];
  superseded?: { id: string; reason: string };
}

export async function remember(
  env: Env,
  db: Client,
  content: string,
): Promise<RememberResult> {
  // 1. Fan out parallel OpenAI calls: embedding + metadata extraction
  const [embedding, metadata] = await Promise.all([
    embed(env, content),
    extractMetadata(env, content),
  ]);

  // 2. Dedup + supersede check (read-only)
  const supersedeResult = await checkSupersede(env, db, content, embedding);

  if (supersedeResult.isDuplicate) {
    throw new Error(
      "This thought is too similar to an existing memory. Not stored.",
    );
  }

  // 3. Build atomic batch of all writes
  const id = generateId();
  const embeddingJson = embeddingToJson(embedding);

  const statements: InStatement[] = [
    // Insert the new thought
    {
      sql: `INSERT INTO thoughts (id, content, embedding, type, topics, people, action_items)
            VALUES (:id, :content, vector(:embedding), :type, :topics, :people, :action_items)`,
      args: {
        id,
        content,
        embedding: embeddingJson,
        type: metadata.type,
        topics: JSON.stringify(metadata.topics),
        people: JSON.stringify(metadata.people),
        action_items: JSON.stringify(metadata.action_items),
      },
    },
    // Sync FTS index
    {
      sql: `INSERT INTO thought_fts (rowid, content)
            SELECT rowid, content FROM thoughts WHERE id = :id`,
      args: { id },
    },
  ];

  // If superseding, update old thought and clean up its FTS entry
  if (supersedeResult.supersedes) {
    const oldId = supersedeResult.supersedes.id;
    statements.push(
      {
        sql: `UPDATE thoughts SET status = 'superseded', superseded_by = :newId, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = :oldId`,
        args: { newId: id, oldId },
      },
      {
        sql: `DELETE FROM thought_fts WHERE rowid = (SELECT rowid FROM thoughts WHERE id = :id)`,
        args: { id: oldId },
      },
    );
  }

  // 4. Execute all writes atomically
  await db.batch(statements, "write");

  return {
    id,
    ...metadata,
    superseded: supersedeResult.supersedes
      ? {
          id: supersedeResult.supersedes.id,
          reason: supersedeResult.supersedes.reason,
        }
      : undefined,
  };
}
