import type { Env } from "../index";

export interface RecallOptions {
  query: string;
  limit?: number;
  threshold?: number;
  includeSupereded?: boolean;
  filter?: { type?: string; topics?: string[] };
}

export async function recall(_env: Env, _options: RecallOptions) {
  // TODO: Implement hybrid search
  // 1. Embed query via OpenAI
  // 2. Run semantic search (sqlite-vec) and FTS5 search in parallel
  // 3. Merge and deduplicate by thought ID
  // 4. Apply staleness flags
  throw new Error("Not implemented");
}
