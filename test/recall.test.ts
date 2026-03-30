import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  Thought,
  ThoughtRepository,
  VectorSearchResult,
} from "../src/repository";
import type { Embedder } from "../src/services/llm";
import { recall } from "../src/tools/recall";

const FAKE_EMBEDDING = Array.from({ length: 1536 }, () => 0.1);

const mockEmbedder: Embedder = {
  embed: vi
    .fn<(text: string) => Promise<number[]>>()
    .mockResolvedValue(FAKE_EMBEDDING),
};

function makeVectorResult(
  overrides: Partial<VectorSearchResult> = {},
): VectorSearchResult {
  return {
    id: "abc123",
    content: "test thought",
    type: "observation",
    topics: ["testing"],
    people: [],
    createdAt: new Date().toISOString(),
    distance: 0.1,
    ...overrides,
  };
}

function makeFtsResult(overrides: Partial<Thought> = {}): Thought {
  return {
    id: "abc123",
    content: "test thought",
    type: "observation",
    topics: ["testing"],
    people: [],
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function mockRepo(
  vectorResults: VectorSearchResult[] = [],
  ftsResults: Thought[] = [],
): ThoughtRepository {
  return {
    insert: vi.fn(),
    insertAndSupersede: vi.fn(),
    vectorSearch: vi.fn().mockResolvedValue(vectorResults),
    ftsSearch: vi.fn().mockResolvedValue(ftsResults),
    findSimilarActive: vi.fn(),
    browse: vi.fn(),
    softDelete: vi.fn(),
    stats: vi.fn(),
  } as ThoughtRepository;
}

describe("recall", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(mockEmbedder.embed).mockResolvedValue(FAKE_EMBEDDING);
  });

  it("returns vector results above threshold", async () => {
    const repo = mockRepo([makeVectorResult({ distance: 0.1 })]);

    const results = await recall(mockEmbedder, repo, { query: "test" });

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("abc123");
    expect(results[0].similarity).toBeCloseTo(0.9);
  });

  it("filters out vector results below threshold", async () => {
    const repo = mockRepo([makeVectorResult({ distance: 0.5 })]);

    const results = await recall(mockEmbedder, repo, {
      query: "test",
      threshold: 0.7,
    });

    expect(results).toHaveLength(0);
  });

  it("includes FTS results not in vector results", async () => {
    const repo = mockRepo(
      [makeVectorResult({ id: "vec1", distance: 0.05 })],
      [makeFtsResult({ id: "fts1" })],
    );

    const results = await recall(mockEmbedder, repo, { query: "test" });

    expect(results).toHaveLength(2);
    expect(results[0].id).toBe("vec1");
    expect(results[1].id).toBe("fts1");
    expect(results[1].similarity).toBeNull();
  });

  it("deduplicates by thought ID", async () => {
    const repo = mockRepo(
      [makeVectorResult({ id: "same", distance: 0.1 })],
      [makeFtsResult({ id: "same" })],
    );

    const results = await recall(mockEmbedder, repo, { query: "test" });

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("same");
    expect(results[0].similarity).toBeCloseTo(0.9);
  });

  it("sorts vector results before FTS results", async () => {
    const repo = mockRepo(
      [
        makeVectorResult({ id: "vec1", distance: 0.15 }),
        makeVectorResult({ id: "vec2", distance: 0.05 }),
      ],
      [makeFtsResult({ id: "fts1" })],
    );

    const results = await recall(mockEmbedder, repo, { query: "test" });

    expect(results.map((r) => r.id)).toEqual(["vec2", "vec1", "fts1"]);
  });

  it("applies type filter", async () => {
    const repo = mockRepo([
      makeVectorResult({ id: "a", type: "decision", distance: 0.1 }),
      makeVectorResult({ id: "b", type: "observation", distance: 0.1 }),
    ]);

    const results = await recall(mockEmbedder, repo, {
      query: "test",
      filter: { type: "decision" },
    });

    expect(results).toHaveLength(1);
    expect(results[0].type).toBe("decision");
  });

  it("applies topics filter", async () => {
    const repo = mockRepo([
      makeVectorResult({ id: "a", topics: ["database"], distance: 0.1 }),
      makeVectorResult({ id: "b", topics: ["frontend"], distance: 0.1 }),
    ]);

    const results = await recall(mockEmbedder, repo, {
      query: "test",
      filter: { topics: ["database"] },
    });

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("a");
  });

  it("flags stale decisions older than 180 days", async () => {
    const old = new Date();
    old.setDate(old.getDate() - 200);

    const repo = mockRepo([
      makeVectorResult({
        id: "old",
        type: "decision",
        createdAt: old.toISOString(),
        distance: 0.1,
      }),
    ]);

    const results = await recall(mockEmbedder, repo, { query: "test" });

    expect(results[0].stale).toBe(true);
  });

  it("does not flag recent thoughts as stale", async () => {
    const repo = mockRepo([
      makeVectorResult({
        type: "decision",
        createdAt: new Date().toISOString(),
        distance: 0.1,
      }),
    ]);

    const results = await recall(mockEmbedder, repo, { query: "test" });

    expect(results[0].stale).toBe(false);
  });

  it("passes clamped limit to repository", async () => {
    const repo = mockRepo();
    await recall(mockEmbedder, repo, { query: "test", limit: 100 });

    expect(repo.vectorSearch).toHaveBeenCalledWith(
      FAKE_EMBEDDING,
      expect.objectContaining({ limit: 50 }),
    );
  });

  it("returns empty array when no results match", async () => {
    const repo = mockRepo();

    const results = await recall(mockEmbedder, repo, { query: "nonexistent" });

    expect(results).toEqual([]);
  });

  it("preserves topics and people arrays from repository", async () => {
    const repo = mockRepo([
      makeVectorResult({
        topics: ["arch", "db"],
        people: ["Sarah", "Tom"],
        distance: 0.1,
      }),
    ]);

    const results = await recall(mockEmbedder, repo, { query: "test" });

    expect(results[0].topics).toEqual(["arch", "db"]);
    expect(results[0].people).toEqual(["Sarah", "Tom"]);
  });
});
