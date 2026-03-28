import type { Client } from "@libsql/client/web";
import type { Env } from "../index";
import { embeddingToJson } from "./db";

export interface SupersedeResult {
  isDuplicate: boolean;
  supersedes?: { id: string; content: string; reason: string };
}

const SUPERSEDE_PROMPT = `Two thoughts are shown. Does the NEW thought supersede (replace, update, or contradict) the OLD thought?
Respond with JSON only, no markdown: {"supersedes": boolean, "reason": "brief explanation"}

OLD: {old_content}
NEW: {new_content}`;

export async function checkSupersede(
  env: Env,
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
          LIMIT 5`,
    args: { embedding: embeddingJson },
  });

  for (const row of similar.rows) {
    const distance = row.distance as number;
    const similarity = 1 - distance;

    // >= 0.95 = duplicate, reject
    if (similarity >= 0.95) {
      return { isDuplicate: true };
    }

    // 0.85-0.95 = ask LLM if new supersedes old
    if (similarity >= 0.85) {
      const prompt = SUPERSEDE_PROMPT.replace(
        "{old_content}",
        row.content as string,
      ).replace("{new_content}", newContent);

      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" },
            temperature: 0,
          }),
        },
      );

      if (!response.ok) continue;

      const result = (await response.json()) as {
        choices: [{ message: { content: string } }];
      };
      const parsed = JSON.parse(result.choices[0].message.content) as {
        supersedes: boolean;
        reason: string;
      };

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
