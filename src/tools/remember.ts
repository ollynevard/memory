import type { Env } from "../index";

export async function remember(_env: Env, _content: string) {
  // TODO: Implement capture pipeline
  // 1. Fan out parallel OpenAI calls: embedding + metadata extraction
  // 2. Dedup check via vector similarity (>= 0.95 = reject)
  // 3. Supersede check (0.85-0.95 similarity + LLM confirmation)
  // 4. Insert thought, embedding, and FTS record
  throw new Error("Not implemented");
}
