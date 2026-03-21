import type { Env } from "../index";

export interface BrowseOptions {
  limit?: number;
  type?: string;
  includeSupereded?: boolean;
}

export async function browse(_env: Env, _options: BrowseOptions) {
  // TODO: List recent thoughts chronologically
  // SELECT from thoughts WHERE status = 'active' ORDER BY created_at DESC
  throw new Error("Not implemented");
}
