import type { Env } from "../index";

export async function embed(env: Env, text: string): Promise<number[]> {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI embedding failed: ${response.status} ${error}`);
  }

  const result = (await response.json()) as {
    data: [{ embedding: number[] }];
  };
  return result.data[0].embedding;
}

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
  env: Env,
  content: string,
): Promise<ThoughtMetadata> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: METADATA_PROMPT },
        { role: "user", content },
      ],
      response_format: { type: "json_object" },
      temperature: 0,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(
      `OpenAI metadata extraction failed: ${response.status} ${error}`,
    );
  }

  const result = (await response.json()) as {
    choices: [{ message: { content: string } }];
  };

  const parsed = JSON.parse(result.choices[0].message.content) as Record<
    string,
    unknown
  >;

  return {
    type: typeof parsed.type === "string" ? parsed.type : "observation",
    topics: Array.isArray(parsed.topics) ? parsed.topics : [],
    people: Array.isArray(parsed.people) ? parsed.people : [],
    action_items: Array.isArray(parsed.action_items) ? parsed.action_items : [],
  };
}
