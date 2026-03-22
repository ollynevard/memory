import type { Client } from "@libsql/client/web";
import { describe, expect, it, vi } from "vitest";
import { browse } from "../src/tools/browse";
import { forget } from "../src/tools/forget";
import { stats } from "../src/tools/stats";

function mockDb(
  ...results: { rows: Record<string, unknown>[]; rowsAffected?: number }[]
): Client {
  const execute = vi.fn();
  for (const result of results) {
    execute.mockResolvedValueOnce({
      rows: result.rows,
      rowsAffected: result.rowsAffected ?? 0,
    });
  }
  return { execute } as unknown as Client;
}

describe("browse", () => {
  it("returns thoughts ordered by created_at", async () => {
    const db = mockDb({
      rows: [
        {
          id: "a",
          content: "first",
          type: "observation",
          topics: '["t1"]',
          people: "[]",
          created_at: "2026-03-22T10:00:00Z",
        },
        {
          id: "b",
          content: "second",
          type: "idea",
          topics: "[]",
          people: '["Sarah"]',
          created_at: "2026-03-21T10:00:00Z",
        },
      ],
    });

    const results = await browse(db, {});

    expect(results).toHaveLength(2);
    expect(results[0].id).toBe("a");
    expect(results[0].topics).toEqual(["t1"]);
    expect(results[1].people).toEqual(["Sarah"]);
  });

  it("filters by type when provided", async () => {
    const db = mockDb({ rows: [] });

    await browse(db, { type: "decision" });

    const call = vi.mocked(db.execute).mock.calls[0];
    const sql = (call[0] as unknown as { sql: string }).sql;
    expect(sql).toContain("AND type = :type");
  });

  it("clamps limit to 1-100 range", async () => {
    const db = mockDb({ rows: [] });

    await browse(db, { limit: 200 });

    const call = vi.mocked(db.execute).mock.calls[0];
    const args = (call[0] as unknown as { args: Record<string, unknown> }).args;
    expect(args.limit).toBe(100);
  });

  it("returns empty array when no thoughts exist", async () => {
    const db = mockDb({ rows: [] });

    const results = await browse(db, {});

    expect(results).toEqual([]);
  });
});

describe("forget", () => {
  it("returns true when thought is deleted", async () => {
    const db = mockDb({ rows: [], rowsAffected: 1 });

    const result = await forget(db, "abc123");

    expect(result).toBe(true);
  });

  it("returns false when thought not found", async () => {
    const db = mockDb({ rows: [], rowsAffected: 0 });

    const result = await forget(db, "nonexistent");

    expect(result).toBe(false);
  });

  it("sets status to deleted with timestamp", async () => {
    const db = mockDb({ rows: [], rowsAffected: 1 });

    await forget(db, "abc123");

    const call = vi.mocked(db.execute).mock.calls[0];
    const sql = (call[0] as unknown as { sql: string }).sql;
    expect(sql).toContain("status = 'deleted'");
    expect(sql).toContain("deleted_at");
    expect(sql).toContain("status != 'deleted'");
  });
});

describe("stats", () => {
  it("returns aggregated statistics", async () => {
    const db = mockDb(
      { rows: [{ count: 42 }] },
      {
        rows: [
          { type: "observation", count: 30 },
          { type: "decision", count: 12 },
        ],
      },
      { rows: [{ count: 5 }] },
      { rows: [{ created_at: "2026-03-22T10:00:00Z" }] },
    );

    const result = await stats(db);

    expect(result.total).toBe(42);
    expect(result.byType).toEqual({ observation: 30, decision: 12 });
    expect(result.superseded).toBe(5);
    expect(result.mostRecent).toBe("2026-03-22T10:00:00Z");
  });

  it("returns null mostRecent when no thoughts exist", async () => {
    const db = mockDb(
      { rows: [{ count: 0 }] },
      { rows: [] },
      { rows: [{ count: 0 }] },
      { rows: [] },
    );

    const result = await stats(db);

    expect(result.total).toBe(0);
    expect(result.byType).toEqual({});
    expect(result.mostRecent).toBeNull();
  });
});
