import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { StatsResult, ThoughtRepository } from "../repository";

export type { StatsResult };

export async function stats(repo: ThoughtRepository): Promise<StatsResult> {
  return repo.stats();
}

export async function handler(
  repo: ThoughtRepository,
): Promise<CallToolResult> {
  try {
    const result = await stats(repo);

    const parts = [`Total active: ${result.total}`];
    if (Object.keys(result.byType).length > 0) {
      const breakdown = Object.entries(result.byType)
        .map(([t, count]) => `${t}: ${count}`)
        .join(", ");
      parts.push(`By type: ${breakdown}`);
    }
    parts.push(`Superseded: ${result.superseded}`);
    parts.push(`Most recent: ${result.mostRecent ?? "none"}`);

    return { content: [{ type: "text", text: parts.join("\n") }] };
  } catch (err) {
    console.error("stats failed:", err);
    return {
      content: [
        { type: "text", text: "Failed to retrieve stats. Please try again." },
      ],
      isError: true,
    };
  }
}
