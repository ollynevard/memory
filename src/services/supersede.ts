import type { Env } from "../index";

export interface SupersedeResult {
  isDuplicate: boolean;
  supersedes?: string;
  reason?: string;
}

export async function checkSupersede(
  _env: Env,
  _newContent: string,
  _newEmbedding: number[],
): Promise<SupersedeResult> {
  // TODO: Implement dedup + supersede logic
  // 1. Search existing active thoughts by vector similarity
  // 2. >= 0.95 similarity = duplicate, reject
  // 3. 0.85-0.95 similarity = ask gpt-4o-mini if new supersedes old
  // 4. If yes, mark old as superseded
  throw new Error("Not implemented");
}
