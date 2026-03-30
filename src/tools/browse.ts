import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { LIMITS } from "../constants";
import {
  THOUGHT_TYPES,
  type Thought,
  type ThoughtRepository,
  type ThoughtType,
} from "../repository";
import { mcpHandler } from "./handler";

export interface BrowseOptions {
  limit?: number;
  type?: ThoughtType;
  includeSuperseded?: boolean;
}

export async function browse(
  repo: ThoughtRepository,
  options: BrowseOptions,
): Promise<Thought[]> {
  const limit = Math.min(
    Math.max(options.limit ?? LIMITS.BROWSE_DEFAULT, 1),
    LIMITS.BROWSE_MAX,
  );

  return repo.browse({
    limit,
    type: options.type,
    includeSuperseded: options.includeSuperseded,
  });
}

export const schema = {
  limit: z
    .number()
    .min(1)
    .max(LIMITS.BROWSE_MAX)
    .default(LIMITS.BROWSE_DEFAULT)
    .describe("Maximum results to return."),
  type: z
    .enum(THOUGHT_TYPES)
    .optional()
    .describe("Optional filter by thought type."),
};

export async function handler(
  repo: ThoughtRepository,
  { limit, type }: { limit: number; type?: ThoughtType },
): Promise<CallToolResult> {
  return mcpHandler("browse thoughts", async () => {
    const results = await browse(repo, { limit, type });

    if (results.length === 0) {
      return {
        content: [{ type: "text", text: "No thoughts stored yet." }],
      };
    }

    const text = results
      .map((r) => {
        const parts = [`[${r.id}] (${r.type}) ${r.content}`];
        if (r.topics.length > 0) parts.push(`  topics: ${r.topics.join(", ")}`);
        parts.push(`  created: ${r.createdAt}`);
        return parts.join("\n");
      })
      .join("\n\n");

    return { content: [{ type: "text", text }] };
  });
}
