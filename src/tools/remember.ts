import type { Client, InStatement } from "@libsql/client/web";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { LIMITS } from "../constants";
import { DuplicateThoughtError } from "../errors";
import { createClient, embeddingToJson, generateId } from "../services/db";
import { timed } from "../services/logger";
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
  apiKey: string,
  db: Client,
  content: string,
): Promise<RememberResult> {
  // 1. Fan out parallel OpenAI calls: embedding + metadata extraction
  const [embedding, metadata] = await Promise.all([
    timed("embed", () => embed(apiKey, content)),
    timed("extract_metadata", () => extractMetadata(apiKey, content)),
  ]);

  // 2. Dedup + supersede check (read-only)
  const supersedeResult = await timed("check_supersede", () =>
    checkSupersede(apiKey, db, content, embedding),
  );

  if (supersedeResult.isDuplicate) {
    throw new DuplicateThoughtError();
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
  await timed("db_write", () => db.batch(statements, "write"), {
    statements: statements.length,
  });

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

export const schema = {
  content: z.string().describe("The thought to remember, in natural language."),
};

export interface RememberEnv {
  OPENAI_API_KEY: string;
  TURSO_URL: string;
  TURSO_AUTH_TOKEN: string;
}

export async function handler(
  env: RememberEnv,
  { content }: { content: string },
): Promise<CallToolResult> {
  if (content.length > LIMITS.REMEMBER_CONTENT) {
    return {
      content: [
        { type: "text", text: "Content too long. Maximum 50,000 characters." },
      ],
      isError: true,
    };
  }

  try {
    const db = createClient(env.TURSO_URL, env.TURSO_AUTH_TOKEN);
    const result = await remember(env.OPENAI_API_KEY, db, content);

    const parts = [`Remembered (${result.id}): ${result.type}`];
    if (result.topics.length > 0)
      parts.push(`Topics: ${result.topics.join(", ")}`);
    if (result.people.length > 0)
      parts.push(`People: ${result.people.join(", ")}`);
    if (result.action_items.length > 0)
      parts.push(`Action items: ${result.action_items.join("; ")}`);
    if (result.superseded)
      parts.push(
        `Superseded ${result.superseded.id}: ${result.superseded.reason}`,
      );

    return { content: [{ type: "text", text: parts.join("\n") }] };
  } catch (err) {
    if (err instanceof DuplicateThoughtError) {
      return { content: [{ type: "text", text: err.message }], isError: true };
    }
    console.error("remember failed:", err);
    return {
      content: [
        { type: "text", text: "Failed to store thought. Please try again." },
      ],
      isError: true,
    };
  }
}
