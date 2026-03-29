import type { Client } from "@libsql/client/web";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Embedder } from "../src/services/llm";
import { recall } from "../src/tools/recall";

const FAKE_EMBEDDING = Array.from({ length: 1536 }, () => 0.1);

const mockEmbedder: Embedder = {
  embed: vi
    .fn<(text: string) => Promise<number[]>>()
    .mockResolvedValue(FAKE_EMBEDDING),
};

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "abc123",
    content: "test thought",
    type: "observation",
    topics: '["testing"]',
    people: "[]",
    created_at: new Date().toISOString(),
    distance: 0.1,
    ...overrides,
  };
}

function mockDb(
  vectorRows: Record<string, unknown>[] = [],
  ftsRows: Record<string, unknown>[] = [],
): Client {
  const execute = vi
    .fn()
    // First call: vector search
    .mockResolvedValueOnce({ rows: vectorRows })
    // Second call: FTS search
    .mockResolvedValueOnce({ rows: ftsRows });

  return { execute } as unknown as Client;
}

describe("recall", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(mockEmbedder.embed).mockResolvedValue(FAKE_EMBEDDING);
  });

  it("returns vector results above threshold", async () => {
    const db = mockDb([makeRow({ distance: 0.1 })]);

    const results = await recall(mockEmbedder, db, { query: "test" });

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("abc123");
    expect(results[0].similarity).toBeCloseTo(0.9);
  });

  it("filters out vector results below threshold", async () => {
    const db = mockDb([makeRow({ distance: 0.5 })]);

    const results = await recall(mockEmbedder, db, {
      query: "test",
      threshold: 0.7,
    });

    expect(results).toHaveLength(0);
  });

  it("includes FTS results not in vector results", async () => {
    const db = mockDb(
      [makeRow({ id: "vec1", distance: 0.05 })],
      [makeRow({ id: "fts1", fts_rank: -5 })],
    );

    const results = await recall(mockEmbedder, db, { query: "test" });

    expect(results).toHaveLength(2);
    expect(results[0].id).toBe("vec1");
    expect(results[1].id).toBe("fts1");
    expect(results[1].similarity).toBeNull();
  });

  it("deduplicates by thought ID", async () => {
    const db = mockDb(
      [makeRow({ id: "same", distance: 0.1 })],
      [makeRow({ id: "same", fts_rank: -5 })],
    );

    const results = await recall(mockEmbedder, db, { query: "test" });

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("same");
    expect(results[0].similarity).toBeCloseTo(0.9);
  });

  it("sorts vector results before FTS results", async () => {
    const db = mockDb(
      [
        makeRow({ id: "vec1", distance: 0.15 }),
        makeRow({ id: "vec2", distance: 0.05 }),
      ],
      [makeRow({ id: "fts1", fts_rank: -10 })],
    );

    const results = await recall(mockEmbedder, db, { query: "test" });

    expect(results.map((r) => r.id)).toEqual(["vec2", "vec1", "fts1"]);
  });

  it("applies type filter", async () => {
    const db = mockDb([
      makeRow({ id: "a", type: "decision", distance: 0.1 }),
      makeRow({ id: "b", type: "observation", distance: 0.1 }),
    ]);

    const results = await recall(mockEmbedder, db, {
      query: "test",
      filter: { type: "decision" },
    });

    expect(results).toHaveLength(1);
    expect(results[0].type).toBe("decision");
  });

  it("applies topics filter", async () => {
    const db = mockDb([
      makeRow({ id: "a", topics: '["database"]', distance: 0.1 }),
      makeRow({ id: "b", topics: '["frontend"]', distance: 0.1 }),
    ]);

    const results = await recall(mockEmbedder, db, {
      query: "test",
      filter: { topics: ["database"] },
    });

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("a");
  });

  it("flags stale decisions older than 180 days", async () => {
    const old = new Date();
    old.setDate(old.getDate() - 200);

    const db = mockDb([
      makeRow({
        id: "old",
        type: "decision",
        created_at: old.toISOString(),
        distance: 0.1,
      }),
    ]);

    const results = await recall(mockEmbedder, db, { query: "test" });

    expect(results[0].stale).toBe(true);
  });

  it("does not flag recent thoughts as stale", async () => {
    const db = mockDb([
      makeRow({
        type: "decision",
        created_at: new Date().toISOString(),
        distance: 0.1,
      }),
    ]);

    const results = await recall(mockEmbedder, db, { query: "test" });

    expect(results[0].stale).toBe(false);
  });

  it("clamps limit to 1-50 range", async () => {
    const db = mockDb();
    await recall(mockEmbedder, db, { query: "test", limit: 100 });

    const vectorCall = vi.mocked(db.execute).mock.calls[0];
    const args = (vectorCall[0] as unknown as { args: Record<string, unknown> })
      .args;
    expect(args.limit).toBe(50);
  });

  it("returns empty array when no results match", async () => {
    const db = mockDb();

    const results = await recall(mockEmbedder, db, { query: "nonexistent" });

    expect(results).toEqual([]);
  });

  it("parses topics and people from JSON strings", async () => {
    const db = mockDb([
      makeRow({
        topics: '["arch","db"]',
        people: '["Sarah","Tom"]',
        distance: 0.1,
      }),
    ]);

    const results = await recall(mockEmbedder, db, { query: "test" });

    expect(results[0].topics).toEqual(["arch", "db"]);
    expect(results[0].people).toEqual(["Sarah", "Tom"]);
  });
});
