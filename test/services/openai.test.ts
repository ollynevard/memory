import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatModel } from "../../src/services/llm";
import {
  createOpenAIChatModel,
  createOpenAIEmbedder,
  extractMetadata,
} from "../../src/services/openai";

const apiKey = "test-key";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = vi.fn();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockFetchResponse(body: unknown, ok = true) {
  vi.mocked(globalThis.fetch).mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status: ok ? 200 : 500,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

describe("createOpenAIEmbedder", () => {
  it("returns a 1536-dimensional embedding", async () => {
    const embedding = Array.from({ length: 1536 }, () => 0.1);
    mockFetchResponse({ data: [{ embedding }] });

    const embedder = createOpenAIEmbedder(apiKey);
    const result = await embedder.embed("test thought");

    expect(result).toHaveLength(1536);
    expect(result[0]).toBe(0.1);
  });

  it("calls the correct OpenAI endpoint", async () => {
    mockFetchResponse({ data: [{ embedding: [0.1] }] });

    const embedder = createOpenAIEmbedder(apiKey);
    await embedder.embed("test thought");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.openai.com/v1/embeddings",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-key",
        }),
      }),
    );
  });

  it("throws on non-retryable API error", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response("Bad Request", { status: 400 }),
    );

    const embedder = createOpenAIEmbedder(apiKey);
    await expect(embedder.embed("test")).rejects.toThrow(
      "OpenAI embedding failed",
    );
  });
});

describe("extractMetadata", () => {
  it("extracts metadata from content", async () => {
    mockFetchResponse({
      choices: [
        {
          message: {
            content: JSON.stringify({
              type: "decision",
              topics: ["architecture", "database"],
              people: ["Sarah"],
              action_items: ["review schema"],
            }),
          },
        },
      ],
    });

    const chat = createOpenAIChatModel(apiKey);
    const result = await extractMetadata(
      chat,
      "Sarah suggested we use Postgres for the new project",
    );

    expect(result.type).toBe("decision");
    expect(result.topics).toEqual(["architecture", "database"]);
    expect(result.people).toEqual(["Sarah"]);
    expect(result.action_items).toEqual(["review schema"]);
  });

  it("falls back to defaults for missing fields", async () => {
    mockFetchResponse({
      choices: [{ message: { content: JSON.stringify({}) } }],
    });

    const chat = createOpenAIChatModel(apiKey);
    const result = await extractMetadata(chat, "some thought");

    expect(result.type).toBe("observation");
    expect(result.topics).toEqual([]);
    expect(result.people).toEqual([]);
    expect(result.action_items).toEqual([]);
  });

  it("throws on non-retryable API error", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response("Bad Request", { status: 400 }),
    );

    const chat = createOpenAIChatModel(apiKey);
    await expect(extractMetadata(chat, "test")).rejects.toThrow(
      "OpenAI chat completion failed",
    );
  });
});
