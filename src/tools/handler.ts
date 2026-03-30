import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/** Wraps an MCP tool handler with consistent error logging and formatting. */
export async function mcpHandler(
  name: string,
  fn: () => Promise<CallToolResult>,
): Promise<CallToolResult> {
  try {
    return await fn();
  } catch (err) {
    console.error(`${name} failed:`, err);
    return {
      content: [{ type: "text", text: `Failed to ${name}. Please try again.` }],
      isError: true,
    };
  }
}
