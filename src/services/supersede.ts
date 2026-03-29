import { LIMITS, SIMILARITY } from "../constants";
import type { ThoughtRepository } from "../repository";
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
  repo: ThoughtRepository,
  newContent: string,
  newEmbedding: number[],
): Promise<SupersedeResult> {
  const similar = await repo.findSimilarActive(
    newEmbedding,
    LIMITS.SUPERSEDE_CANDIDATES,
  );

  for (const row of similar) {
    const similarity = 1 - row.distance;

    if (similarity >= SIMILARITY.DUPLICATE) {
      return { isDuplicate: true };
    }

    if (similarity >= SIMILARITY.SUPERSEDE) {
      const prompt = SUPERSEDE_PROMPT.replace(
        "{old_content}",
        row.content,
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
            id: row.id,
            content: row.content,
            reason: parsed.reason,
          },
        };
      }
    }
  }

  return { isDuplicate: false };
}
