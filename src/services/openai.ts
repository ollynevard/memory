import type { Env } from "../index";

export async function fetchWithRetry(
  input: RequestInfo,
  init: RequestInit,
  maxRetries = 3,
): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(input, init);

    if (response.ok || (response.status < 500 && response.status !== 429)) {
      return response;
    }

    if (attempt < maxRetries) {
      const delay = Math.min(1000 * 2 ** attempt, 8000);
      await new Promise((resolve) => setTimeout(resolve, delay));
    } else {
      return response;
    }
  }
  throw new Error("Unreachable");
}

export async function embed(env: Env, text: string): Promise<number[]> {
  const response = await fetchWithRetry(
    "https://api.openai.com/v1/embeddings",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: text,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`OpenAI embedding failed (${response.status})`);
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
  const response = await fetchWithRetry(
    "https://api.openai.com/v1/chat/completions",
    {
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
    },
  );

  if (!response.ok) {
    throw new Error(`OpenAI metadata extraction failed (${response.status})`);
  }

  const result = (await response.json()) as {
    choices: [{ message: { content: string } }];
  };

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(result.choices[0].message.content) as Record<
      string,
      unknown
    >;
  } catch {
    console.error(
      "Failed to parse metadata response:",
      result.choices[0].message.content,
    );
    return { type: "observation", topics: [], people: [], action_items: [] };
  }

  return {
    type: typeof parsed.type === "string" ? parsed.type : "observation",
    topics: Array.isArray(parsed.topics) ? parsed.topics : [],
    people: Array.isArray(parsed.people) ? parsed.people : [],
    action_items: Array.isArray(parsed.action_items) ? parsed.action_items : [],
  };
}
