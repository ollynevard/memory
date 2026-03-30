import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { LIMITS } from "../constants";
import type { ThoughtRepository, ThoughtRow } from "../repository";

export interface BrowseOptions {
  limit?: number;
  type?: string;
  includeSuperseded?: boolean;
}

export type BrowseResult = ThoughtRow;

export async function browse(
  repo: ThoughtRepository,
  options: BrowseOptions,
): Promise<BrowseResult[]> {
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
  type: z.string().optional().describe("Optional filter by thought type."),
};

export async function handler(
  repo: ThoughtRepository,
  { limit, type }: { limit: number; type?: string },
): Promise<CallToolResult> {
  try {
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
        parts.push(`  created: ${r.created_at}`);
        return parts.join("\n");
      })
      .join("\n\n");

    return { content: [{ type: "text", text }] };
  } catch (err) {
    console.error("browse failed:", err);
    return {
      content: [
        { type: "text", text: "Failed to browse thoughts. Please try again." },
      ],
      isError: true,
    };
  }
}
