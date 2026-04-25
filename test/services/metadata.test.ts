import { describe, expect, it } from "vitest";
import type { ChatModel } from "../../src/services/llm";
import { extractMetadata } from "../../src/services/metadata";

function mockChat(response: string): ChatModel {
  return {
    complete: async () => response,
  };
}

describe("extractMetadata", () => {
  it("extracts metadata from content", async () => {
    const chat = mockChat(
      JSON.stringify({
        type: "decision",
        topics: ["architecture", "database"],
        people: ["Sarah"],
        action_items: ["review schema"],
      }),
    );

    const result = await extractMetadata(
      chat,
      "Sarah suggested we use Postgres for the new project",
    );

    expect(result.type).toBe("decision");
    expect(result.topics).toEqual(["architecture", "database"]);
    expect(result.people).toEqual(["Sarah"]);
    expect(result.action_items).toEqual(["review schema"]);
    expect(result.dates_mentioned).toEqual([]);
  });

  it("extracts dates mentioned in content", async () => {
    const chat = mockChat(
      JSON.stringify({
        type: "task",
        topics: ["meeting"],
        people: ["Sarah"],
        action_items: [],
        dates_mentioned: ["2025-03-05"],
      }),
    );

    const result = await extractMetadata(
      chat,
      "Meeting with Sarah on March 5th 2025",
    );

    expect(result.dates_mentioned).toEqual(["2025-03-05"]);
  });

  it("falls back to defaults for missing fields", async () => {
    const chat = mockChat(JSON.stringify({}));
    const result = await extractMetadata(chat, "some thought");

    expect(result.type).toBe("observation");
    expect(result.topics).toEqual([]);
    expect(result.people).toEqual([]);
    expect(result.action_items).toEqual([]);
    expect(result.dates_mentioned).toEqual([]);
  });

  it("falls back to defaults on invalid JSON", async () => {
    const chat = mockChat("not json");
    const result = await extractMetadata(chat, "test");

    expect(result.type).toBe("observation");
    expect(result.topics).toEqual([]);
    expect(result.people).toEqual([]);
    expect(result.action_items).toEqual([]);
    expect(result.dates_mentioned).toEqual([]);
  });
});
