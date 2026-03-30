import type { ChatModel } from "./llm";

export interface ThoughtMetadata {
  type: string;
  topics: string[];
  people: string[];
  action_items: string[];
}

const METADATA_PROMPT = `Extract metadata from the following thought. Return JSON only, no markdown:
- "type": one of "observation", "decision", "idea", "task", "reference", "person_note", "question"
- "topics": array of 1-4 short topic tags
- "people": array of people mentioned (empty if none)
- "action_items": array of implied to-dos (empty if none)
Only extract what's explicitly present.`;

export async function extractMetadata(
  chat: ChatModel,
  content: string,
): Promise<ThoughtMetadata> {
  const raw = await chat.complete(
    [
      { role: "system", content: METADATA_PROMPT },
      { role: "user", content },
    ],
    { jsonMode: true },
  );

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    console.error("Failed to parse metadata response:", raw);
    return { type: "observation", topics: [], people: [], action_items: [] };
  }

  return {
    type: typeof parsed.type === "string" ? parsed.type : "observation",
    topics: Array.isArray(parsed.topics) ? parsed.topics : [],
    people: Array.isArray(parsed.people) ? parsed.people : [],
    action_items: Array.isArray(parsed.action_items) ? parsed.action_items : [],
  };
}
