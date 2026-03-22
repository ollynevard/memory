import OpenAI from "openai";
import type { Env } from "../index";

export interface ThoughtMetadata {
  type: string;
  topics: string[];
  people: string[];
  action_items: string[];
}

export interface SupersedeCheckResult {
  supersedes: boolean;
  reason: string;
}

const METADATA_FALLBACK: ThoughtMetadata = {
  type: "observation",
  topics: ["uncategorized"],
  people: [],
  action_items: [],
};

function getClient(env: Env): OpenAI {
  return new OpenAI({ apiKey: env.OPENAI_API_KEY });
}

export async function generateEmbedding(
  env: Env,
  text: string,
): Promise<number[]> {
  const client = getClient(env);
  const response = await client.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });
  return response.data[0].embedding;
}

export async function extractMetadata(
  env: Env,
  content: string,
): Promise<ThoughtMetadata> {
  const client = getClient(env);
  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Extract metadata from the following thought. Return JSON:
- "type": one of "observation", "decision", "idea", "task", "reference", "person_note", "question"
- "topics": array of 1-4 short topic tags
- "people": array of people mentioned (empty if none)
- "action_items": array of implied to-dos (empty if none)
Only extract what's explicitly present.`,
        },
        { role: "user", content },
      ],
    });
    const parsed = JSON.parse(response.choices[0].message.content ?? "{}");
    return {
      type: parsed.type ?? METADATA_FALLBACK.type,
      topics: Array.isArray(parsed.topics)
        ? parsed.topics
        : METADATA_FALLBACK.topics,
      people: Array.isArray(parsed.people)
        ? parsed.people
        : METADATA_FALLBACK.people,
      action_items: Array.isArray(parsed.action_items)
        ? parsed.action_items
        : METADATA_FALLBACK.action_items,
    };
  } catch {
    return METADATA_FALLBACK;
  }
}

export async function processThought(
  env: Env,
  content: string,
): Promise<{ embedding: number[]; metadata: ThoughtMetadata }> {
  const [embedding, metadata] = await Promise.all([
    generateEmbedding(env, content),
    extractMetadata(env, content),
  ]);
  return { embedding, metadata };
}

export async function checkSupersede(
  env: Env,
  oldContent: string,
  newContent: string,
): Promise<SupersedeCheckResult> {
  const client = getClient(env);
  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Two thoughts are shown. Does the NEW thought supersede (replace, update, or contradict) the OLD thought?
Respond with JSON: {"supersedes": boolean, "reason": "brief explanation"}`,
        },
        {
          role: "user",
          content: `OLD: ${oldContent}\nNEW: ${newContent}`,
        },
      ],
    });
    const parsed = JSON.parse(response.choices[0].message.content ?? "{}");
    return {
      supersedes: parsed.supersedes === true,
      reason: parsed.reason ?? "",
    };
  } catch {
    return { supersedes: false, reason: "check failed" };
  }
}
