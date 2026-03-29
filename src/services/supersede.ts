import type { Client } from "@libsql/client/web";
import { LIMITS, SIMILARITY } from "../constants";
import { embeddingToJson } from "./db";
import type { ChatModel } from "./llm";

export interface SupersedeResult {
  isDuplicate: boolean;
  supersedes?: { id: string; content: string; reason: string };
}

const SUPERSEDE_PROMPT = `Two thoughts are shown. Does the NEW thought supersede (replace, update, or contradict) the OLD thought?
Respond with JSON only, no markdown: {"supersedes": boolean, "reason": "brief explanation"}

OLD: {old_content}
NEW: {new_content}`;

export async function checkSupersede(
  chat: ChatModel,
  db: Client,
  newContent: string,
  newEmbedding: number[],
): Promise<SupersedeResult> {
  // Search existing active thoughts by vector similarity
  const embeddingJson = embeddingToJson(newEmbedding);
  const similar = await db.execute({
    sql: `SELECT id, content, vector_distance_cos(embedding, vector(:embedding)) as distance
          FROM thoughts
          WHERE status = 'active'
          ORDER BY vector_distance_cos(embedding, vector(:embedding))
          LIMIT :limit`,
    args: { embedding: embeddingJson, limit: LIMITS.SUPERSEDE_CANDIDATES },
  });

  for (const row of similar.rows) {
    const distance = row.distance as number;
    const similarity = 1 - distance;

    if (similarity >= SIMILARITY.DUPLICATE) {
      return { isDuplicate: true };
    }

    if (similarity >= SIMILARITY.SUPERSEDE) {
      const prompt = SUPERSEDE_PROMPT.replace(
        "{old_content}",
        row.content as string,
      ).replace("{new_content}", newContent);

      let raw: string;
      try {
        raw = await chat.complete([{ role: "user", content: prompt }], {
          jsonMode: true,
        });
      } catch (err) {
        console.error("Supersede LLM call failed:", err);
        continue;
      }

      let parsed: { supersedes: boolean; reason: string };
      try {
        parsed = JSON.parse(raw) as {
          supersedes: boolean;
          reason: string;
        };
      } catch (err) {
        console.error("Failed to parse supersede response:", raw, err);
        continue;
      }

      if (parsed.supersedes) {
        return {
          isDuplicate: false,
          supersedes: {
            id: row.id as string,
            content: row.content as string,
            reason: parsed.reason,
          },
        };
      }
    }
  }

  return { isDuplicate: false };
}
