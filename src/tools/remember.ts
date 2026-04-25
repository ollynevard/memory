import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { LIMITS } from "../constants";
import { DuplicateThoughtError } from "../errors";
import type { ThoughtRepository } from "../repository";
import { generateId } from "../services/db";
import type { ChatModel, Embedder } from "../services/llm";
import { timed } from "../services/logger";
import { extractMetadata } from "../services/metadata";
import { checkSupersede } from "../services/supersede";
import { mcpHandler } from "./handler";

export interface RememberResult {
  id: string;
  type: string;
  topics: string[];
  people: string[];
  action_items: string[];
  dates_mentioned: string[];
  superseded?: { id: string; reason: string };
}

async function fingerprint(content: string): Promise<string> {
  const normalized = content.toLowerCase().replace(/\s+/g, " ").trim();
  const encoded = new TextEncoder().encode(normalized);
  const hash = await crypto.subtle.digest("SHA-256", encoded);
  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function remember(
  embedder: Embedder,
  chat: ChatModel,
  repo: ThoughtRepository,
  content: string,
  source = "claude",
): Promise<RememberResult> {
  // 1. Cheap exact-match dedup via content fingerprint
  const fp = await fingerprint(content);
  const exists = await timed("fingerprint_check", () =>
    repo.existsByFingerprint(fp),
  );
  if (exists) {
    throw new DuplicateThoughtError();
  }

  // 2. Fan out parallel LLM calls: embedding + metadata extraction
  const [embedding, metadata] = await Promise.all([
    timed("embed", () => embedder.embed(content)),
    timed("extract_metadata", () => extractMetadata(chat, content)),
  ]);

  // 3. Dedup + supersede check (read-only)
  const supersedeResult = await timed("check_supersede", () =>
    checkSupersede(chat, repo, content, embedding),
  );

  if (supersedeResult.isDuplicate) {
    throw new DuplicateThoughtError();
  }

  // 4. Build thought and persist
  const id = generateId();
  const thought = {
    id,
    content,
    embedding,
    type: metadata.type,
    topics: metadata.topics,
    people: metadata.people,
    action_items: metadata.action_items,
    dates_mentioned: metadata.dates_mentioned,
    content_fingerprint: fp,
    source,
  };

  if (supersedeResult.supersedes) {
    const supersedesId = supersedeResult.supersedes.id;
    await timed("db_write", () =>
      repo.insertAndSupersede(thought, supersedesId),
    );
  } else {
    await timed("db_write", () => repo.insert(thought));
  }

  return {
    id,
    ...metadata,
    superseded: supersedeResult.supersedes
      ? {
          id: supersedeResult.supersedes.id,
          reason: supersedeResult.supersedes.reason,
        }
      : undefined,
  };
}

export const schema = {
  content: z.string().describe("The thought to remember, in natural language."),
  source: z
    .string()
    .optional()
    .describe(
      "Where this thought originated (e.g. 'claude', 'chatgpt', 'notion'). Defaults to 'claude'.",
    ),
};

export async function handler(
  embedder: Embedder,
  chat: ChatModel,
  repo: ThoughtRepository,
  { content, source }: { content: string; source?: string },
): Promise<CallToolResult> {
  if (content.length > LIMITS.REMEMBER_CONTENT) {
    return {
      content: [
        { type: "text", text: "Content too long. Maximum 50,000 characters." },
      ],
      isError: true,
    };
  }

  return mcpHandler("store thought", async () => {
    let result: RememberResult;
    try {
      result = await remember(embedder, chat, repo, content, source);
    } catch (err) {
      if (err instanceof DuplicateThoughtError) {
        return {
          content: [{ type: "text", text: err.message }],
          isError: true,
        };
      }
      throw err;
    }

    const parts = [`Remembered (${result.id}): ${result.type}`];
    if (result.topics.length > 0)
      parts.push(`Topics: ${result.topics.join(", ")}`);
    if (result.people.length > 0)
      parts.push(`People: ${result.people.join(", ")}`);
    if (result.action_items.length > 0)
      parts.push(`Action items: ${result.action_items.join("; ")}`);
    if (result.dates_mentioned.length > 0)
      parts.push(`Dates: ${result.dates_mentioned.join(", ")}`);
    if (result.superseded)
      parts.push(
        `Superseded ${result.superseded.id}: ${result.superseded.reason}`,
      );

    return { content: [{ type: "text", text: parts.join("\n") }] };
  });
}
