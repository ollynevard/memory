import type { Env } from "../index";

export async function embed(_env: Env, _text: string): Promise<number[]> {
  // TODO: Call OpenAI text-embedding-3-small (1536d)
  throw new Error("Not implemented");
}

export interface ThoughtMetadata {
  type: string;
  topics: string[];
  people: string[];
  action_items: string[];
}

export async function extractMetadata(
  _env: Env,
  _content: string,
): Promise<ThoughtMetadata> {
  // TODO: Call gpt-4o-mini to extract metadata from thought content
  throw new Error("Not implemented");
}
