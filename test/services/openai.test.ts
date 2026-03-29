import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../src/index";
import { embed, extractMetadata } from "../../src/services/openai";

const env = { OPENAI_API_KEY: "test-key" } as Env;

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

describe("embed", () => {
  it("returns a 1536-dimensional embedding", async () => {
    const embedding = Array.from({ length: 1536 }, () => 0.1);
    mockFetchResponse({ data: [{ embedding }] });

    const result = await embed(env, "test thought");

    expect(result).toHaveLength(1536);
    expect(result[0]).toBe(0.1);
  });

  it("calls the correct OpenAI endpoint", async () => {
    mockFetchResponse({ data: [{ embedding: [0.1] }] });

    await embed(env, "test thought");

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

    await expect(embed(env, "test")).rejects.toThrow("OpenAI embedding failed");
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

    const result = await extractMetadata(
      env,
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

    const result = await extractMetadata(env, "some thought");

    expect(result.type).toBe("observation");
    expect(result.topics).toEqual([]);
    expect(result.people).toEqual([]);
    expect(result.action_items).toEqual([]);
  });

  it("throws on non-retryable API error", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response("Bad Request", { status: 400 }),
    );

    await expect(extractMetadata(env, "test")).rejects.toThrow(
      "OpenAI chat completion failed",
    );
  });
});
