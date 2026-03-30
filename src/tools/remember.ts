import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { LIMITS } from "../constants";
import { DuplicateThoughtError } from "../errors";
import type { ThoughtRepository, ThoughtType } from "../repository";
import { generateId } from "../services/db";
import type { ChatModel, Embedder } from "../services/llm";
import { timed } from "../services/logger";
import { extractMetadata } from "../services/metadata";
import { checkSupersede } from "../services/supersede";
import { mcpHandler } from "./handler";

export interface RememberResult {
  id: string;
  type: ThoughtType;
  topics: string[];
  people: string[];
  action_items: string[];
  superseded?: { id: string; reason: string };
}

export async function remember(
  embedder: Embedder,
  chat: ChatModel,
  repo: ThoughtRepository,
  content: string,
): Promise<RememberResult> {
  // 1. Fan out parallel LLM calls: embedding + metadata extraction
  const [embedding, metadata] = await Promise.all([
    timed("embed", () => embedder.embed(content)),
    timed("extract_metadata", () => extractMetadata(chat, content)),
  ]);

  // 2. Dedup + supersede check (read-only)
  const supersedeResult = await timed("check_supersede", () =>
    checkSupersede(chat, repo, content, embedding),
  );

  if (supersedeResult.isDuplicate) {
    throw new DuplicateThoughtError();
  }

  // 3. Build thought and persist
  const id = generateId();
  const thought = {
    id,
    content,
    embedding,
    type: metadata.type,
    topics: metadata.topics,
    people: metadata.people,
    action_items: metadata.action_items,
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
};

export async function handler(
  embedder: Embedder,
  chat: ChatModel,
  repo: ThoughtRepository,
  { content }: { content: string },
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
      result = await remember(embedder, chat, repo, content);
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
    if (result.superseded)
      parts.push(
        `Superseded ${result.superseded.id}: ${result.superseded.reason}`,
      );

    return { content: [{ type: "text", text: parts.join("\n") }] };
  });
}
