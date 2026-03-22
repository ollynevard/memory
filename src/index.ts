import { WorkerEntrypoint } from "cloudflare:workers";
import { ProxyToSelf } from "workers-mcp";
import { createClient } from "./services/turso";
import { recall as recallTool } from "./tools/recall";
import { remember as rememberTool } from "./tools/remember";

export interface Env {
  OPENAI_API_KEY: string;
  TURSO_URL: string;
  TURSO_AUTH_TOKEN: string;
  SHARED_SECRET: string;
}

export default class MemoryServer extends WorkerEntrypoint<Env> {
  private proxy = new ProxyToSelf(this);

  /**
   * Store a thought. The server handles embedding, metadata extraction,
   * deduplication, and superseding automatically.
   *
   * @param content {string} The thought to remember, in natural language.
   * @return {string} Confirmation with stored thought ID and extracted metadata.
   */
  async remember(content: string): Promise<string> {
    const db = createClient(this.env);
    const result = await rememberTool(this.env, db, content);

    const parts = [`Remembered (${result.id}): ${result.type}`];
    if (result.topics.length > 0) {
      parts.push(`Topics: ${result.topics.join(", ")}`);
    }
    if (result.people.length > 0) {
      parts.push(`People: ${result.people.join(", ")}`);
    }
    if (result.action_items.length > 0) {
      parts.push(`Action items: ${result.action_items.join("; ")}`);
    }
    if (result.superseded) {
      parts.push(
        `Superseded ${result.superseded.id}: ${result.superseded.reason}`,
      );
    }
    return parts.join("\n");
  }

  /**
   * Search memories by meaning and keyword. Runs hybrid semantic + full-text
   * search and returns ranked results.
   *
   * @param query {string} Natural language search query.
   * @param limit {number} Maximum results to return (default 10, max 50).
   * @return {string} Ranked search results with content, metadata, and similarity scores.
   */
  async recall(query: string, limit: number = 10): Promise<string> {
    const db = createClient(this.env);
    const results = await recallTool(this.env, db, {
      query,
      limit,
    });

    if (results.length === 0) {
      return "No matching memories found.";
    }

    return results
      .map((r) => {
        const parts = [`[${r.id}] (${r.type}) ${r.content}`];
        if (r.similarity !== null) {
          parts.push(`  similarity: ${(r.similarity * 100).toFixed(1)}%`);
        }
        if (r.topics.length > 0) {
          parts.push(`  topics: ${r.topics.join(", ")}`);
        }
        if (r.stale) {
          parts.push("  ⚠ stale — consider reviewing");
        }
        return parts.join("\n");
      })
      .join("\n\n");
  }

  /**
   * List recent thoughts in chronological order.
   *
   * @param limit {number} Maximum results to return (default 20, max 100).
   * @param type {string} Optional filter by thought type.
   * @return {string} Recent thoughts ordered by creation date.
   */
  async browse(limit: number = 20, type?: string): Promise<string> {
    return `TODO: browse (limit ${limit}, type ${type ?? "all"})`;
  }

  /**
   * Soft-delete a thought by ID.
   *
   * @param id {string} The thought ID to forget.
   * @return {string} Confirmation of deletion.
   */
  async forget(id: string): Promise<string> {
    return `TODO: forget "${id}"`;
  }

  /**
   * Overview of the memory store — total count, breakdown by type,
   * superseded count, and most recent capture timestamp.
   *
   * @return {string} Memory store statistics.
   */
  async stats(): Promise<string> {
    return "TODO: stats";
  }

  /**
   * Health check — verifies database connectivity.
   *
   * @return {string} Connection status.
   */
  async ping(): Promise<string> {
    const db = createClient(this.env);
    const result = await db.execute("SELECT COUNT(*) as count FROM thoughts");
    return `Connected. ${result.rows[0].count} thoughts stored.`;
  }

  async fetch(request: Request): Promise<Response> {
    return this.proxy.fetch(request);
  }
}
