import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { ThoughtRepository } from "../repository";
import { mcpHandler } from "./handler";

export async function forget(
  repo: ThoughtRepository,
  id: string,
): Promise<boolean> {
  return repo.softDelete(id);
}

export const schema = {
  id: z.string().describe("The thought ID to forget."),
};

export async function handler(
  repo: ThoughtRepository,
  { id }: { id: string },
): Promise<CallToolResult> {
  return mcpHandler("forget thought", async () => {
    const deleted = await forget(repo, id);

    const text = deleted
      ? `Forgotten: ${id}`
      : `No active thought found with ID "${id}".`;

    return { content: [{ type: "text", text }] };
  });
}
