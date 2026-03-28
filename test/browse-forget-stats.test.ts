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
  return { execute, batch: vi.fn() } as unknown as Client;
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
  function mockForgetDb(rowsAffected: number): Client {
    return {
      execute: vi.fn(),
      batch: vi.fn().mockResolvedValue([
        { rows: [], rowsAffected },
        { rows: [], rowsAffected: 0 },
      ]),
    } as unknown as Client;
  }

  it("returns true when thought is deleted", async () => {
    const db = mockForgetDb(1);

    const result = await forget(db, "abc123");

    expect(result).toBe(true);
  });

  it("returns false when thought not found", async () => {
    const db = mockForgetDb(0);

    const result = await forget(db, "nonexistent");

    expect(result).toBe(false);
  });

  it("batches status update and FTS cleanup", async () => {
    const db = mockForgetDb(1);

    await forget(db, "abc123");

    const batch = vi.mocked(db.batch);
    expect(batch).toHaveBeenCalledOnce();
    const [statements, mode] = batch.mock.calls[0];
    expect(mode).toBe("write");

    const stmts = statements as {
      sql: string;
      args: Record<string, unknown>;
    }[];
    expect(stmts).toHaveLength(2);

    // First: UPDATE status
    expect(stmts[0].sql).toContain("status = 'deleted'");
    expect(stmts[0].sql).toContain("deleted_at");
    expect(stmts[0].sql).toContain("status != 'deleted'");

    // Second: DELETE FTS
    expect(stmts[1].sql).toContain("DELETE FROM thought_fts");
    expect(stmts[1].args.id).toBe("abc123");
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
