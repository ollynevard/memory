import { describe, expect, it, vi } from "vitest";
import type { ThoughtRepository } from "../src/repository";
import { browse } from "../src/tools/browse";
import { forget } from "../src/tools/forget";
import { stats } from "../src/tools/stats";

function mockRepo(
  overrides: Partial<ThoughtRepository> = {},
): ThoughtRepository {
  return {
    existsByFingerprint: vi.fn(),
    insert: vi.fn(),
    insertAndSupersede: vi.fn(),
    vectorSearch: vi.fn(),
    ftsSearch: vi.fn(),
    findSimilarActive: vi.fn(),
    browse: vi.fn().mockResolvedValue([]),
    softDelete: vi.fn().mockResolvedValue(true),
    stats: vi.fn().mockResolvedValue({
      total: 0,
      byType: {},
      superseded: 0,
      mostRecent: null,
    }),
    ...overrides,
  } as ThoughtRepository;
}

describe("browse", () => {
  it("returns thoughts from repository", async () => {
    const repo = mockRepo({
      browse: vi.fn().mockResolvedValue([
        {
          id: "a",
          content: "first",
          type: "observation",
          topics: ["t1"],
          people: [],
          created_at: "2026-03-22T10:00:00Z",
        },
        {
          id: "b",
          content: "second",
          type: "idea",
          topics: [],
          people: ["Sarah"],
          created_at: "2026-03-21T10:00:00Z",
        },
      ]),
    });

    const results = await browse(repo, {});

    expect(results).toHaveLength(2);
    expect(results[0].id).toBe("a");
    expect(results[0].topics).toEqual(["t1"]);
    expect(results[1].people).toEqual(["Sarah"]);
  });

  it("passes type filter to repository", async () => {
    const repo = mockRepo();

    await browse(repo, { type: "decision" });

    expect(repo.browse).toHaveBeenCalledWith(
      expect.objectContaining({ type: "decision" }),
    );
  });

  it("clamps limit to 1-100 range", async () => {
    const repo = mockRepo();

    await browse(repo, { limit: 200 });

    expect(repo.browse).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 100 }),
    );
  });

  it("returns empty array when no thoughts exist", async () => {
    const repo = mockRepo();

    const results = await browse(repo, {});

    expect(results).toEqual([]);
  });
});

describe("forget", () => {
  it("returns true when thought is deleted", async () => {
    const repo = mockRepo({ softDelete: vi.fn().mockResolvedValue(true) });

    const result = await forget(repo, "abc123");

    expect(result).toBe(true);
    expect(repo.softDelete).toHaveBeenCalledWith("abc123");
  });

  it("returns false when thought not found", async () => {
    const repo = mockRepo({ softDelete: vi.fn().mockResolvedValue(false) });

    const result = await forget(repo, "nonexistent");

    expect(result).toBe(false);
  });
});

describe("stats", () => {
  it("returns aggregated statistics from repository", async () => {
    const repo = mockRepo({
      stats: vi.fn().mockResolvedValue({
        total: 42,
        byType: { observation: 30, decision: 12 },
        superseded: 5,
        mostRecent: "2026-03-22T10:00:00Z",
      }),
    });

    const result = await stats(repo);

    expect(result.total).toBe(42);
    expect(result.byType).toEqual({ observation: 30, decision: 12 });
    expect(result.superseded).toBe(5);
    expect(result.mostRecent).toBe("2026-03-22T10:00:00Z");
  });

  it("returns null mostRecent when no thoughts exist", async () => {
    const repo = mockRepo();

    const result = await stats(repo);

    expect(result.total).toBe(0);
    expect(result.byType).toEqual({});
    expect(result.mostRecent).toBeNull();
  });
});
