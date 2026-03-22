import type { Client } from "@libsql/client/web";
import type { Env } from "../index";
import { embed, extractMetadata } from "../services/openai";
import { checkSupersede, updateSupersededBy } from "../services/supersede";

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

  // 2. Dedup + supersede check
  const supersedeResult = await checkSupersede(env, db, content, embedding);

  if (supersedeResult.isDuplicate) {
    throw new Error(
      "This thought is too similar to an existing memory. Not stored.",
    );
  }

  // 3. Insert thought
  const embeddingJson = `[${embedding.join(",")}]`;
  const result = await db.execute({
    sql: `INSERT INTO thoughts (content, embedding, type, topics, people, action_items)
          VALUES (:content, vector(:embedding), :type, :topics, :people, :action_items)
          RETURNING id`,
    args: {
      content,
      embedding: embeddingJson,
      type: metadata.type,
      topics: JSON.stringify(metadata.topics),
      people: JSON.stringify(metadata.people),
      action_items: JSON.stringify(metadata.action_items),
    },
  });

  const id = result.rows[0].id as string;

  // 4. Sync FTS index
  await db.execute({
    sql: `INSERT INTO thought_fts (rowid, content)
          SELECT rowid, content FROM thoughts WHERE id = :id`,
    args: { id },
  });

  // 5. Update superseded_by pointer if we superseded something
  if (supersedeResult.supersedes) {
    await updateSupersededBy(db, supersedeResult.supersedes.id, id);
  }

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
