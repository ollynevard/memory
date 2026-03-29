import type { Client } from "@libsql/client/web";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

export async function forget(db: Client, id: string): Promise<boolean> {
  const results = await db.batch(
    [
      {
        sql: `UPDATE thoughts
              SET status = 'deleted', deleted_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
              WHERE id = :id AND status != 'deleted'`,
        args: { id },
      },
      {
        sql: `DELETE FROM thought_fts WHERE rowid = (SELECT rowid FROM thoughts WHERE id = :id)`,
        args: { id },
      },
    ],
    "write",
  );

  return results[0].rowsAffected > 0;
}

export const schema = {
  id: z.string().describe("The thought ID to forget."),
};

export async function handler(
  db: Client,
  { id }: { id: string },
): Promise<CallToolResult> {
  try {
    const deleted = await forget(db, id);

    const text = deleted
      ? `Forgotten: ${id}`
      : `No active thought found with ID "${id}".`;

    return { content: [{ type: "text", text }] };
  } catch (err) {
    console.error("forget failed:", err);
    return {
      content: [
        { type: "text", text: "Failed to forget thought. Please try again." },
      ],
      isError: true,
    };
  }
}
