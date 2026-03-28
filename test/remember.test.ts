import type { Client, InStatement } from "@libsql/client/web";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../src/index";

// Mock OpenAI services
vi.mock("../src/services/openai", () => ({
  embed: vi.fn(),
  extractMetadata: vi.fn(),
}));

// Mock supersede service
vi.mock("../src/services/supersede", () => ({
  checkSupersede: vi.fn(),
}));

// Mock generateId
vi.mock("../src/services/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/services/db")>();
  return {
    ...actual,
    generateId: vi.fn().mockReturnValue("generated-id-abc"),
  };
});

import { generateId } from "../src/services/db";
import { embed, extractMetadata } from "../src/services/openai";
import { checkSupersede } from "../src/services/supersede";
import { remember } from "../src/tools/remember";

const mockEmbed = vi.mocked(embed);
const mockExtractMetadata = vi.mocked(extractMetadata);
const mockCheckSupersede = vi.mocked(checkSupersede);
const mockGenerateId = vi.mocked(generateId);

const TEST_ENV = {
  OPENAI_API_KEY: "test-key",
  TURSO_URL: "http://localhost:8080",
  TURSO_AUTH_TOKEN: "test-token",
} as unknown as Env;

const FAKE_EMBEDDING = Array.from({ length: 1536 }, () => 0.1);

function mockDb(overrides: Partial<Client> = {}): Client {
  return {
    execute: vi.fn().mockResolvedValue({
      rows: [],
      columns: [],
      columnTypes: [],
      rowsAffected: 1,
      lastInsertRowid: undefined,
    }),
    batch: vi.fn().mockResolvedValue([
      { rows: [], rowsAffected: 1 },
      { rows: [], rowsAffected: 1 },
    ]),
    transaction: vi.fn(),
    executeMultiple: vi.fn(),
    sync: vi.fn(),
    close: vi.fn(),
    closed: false,
    protocol: "http",
    ...overrides,
  } as Client;
}

describe("remember", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockEmbed.mockResolvedValue(FAKE_EMBEDDING);
    mockExtractMetadata.mockResolvedValue({
      type: "observation",
      topics: ["testing"],
      people: [],
      action_items: [],
    });
    mockCheckSupersede.mockResolvedValue({ isDuplicate: false });
    mockGenerateId.mockReturnValue("generated-id-abc");
  });

  it("stores a thought and returns metadata", async () => {
    const db = mockDb();

    const result = await remember(TEST_ENV, db, "Vitest is great for testing");

    expect(result).toEqual({
      id: "generated-id-abc",
      type: "observation",
      topics: ["testing"],
      people: [],
      action_items: [],
      superseded: undefined,
    });
  });

  it("calls embed and extractMetadata in parallel", async () => {
    const db = mockDb();

    await remember(TEST_ENV, db, "some thought");

    expect(mockEmbed).toHaveBeenCalledWith(TEST_ENV, "some thought");
    expect(mockExtractMetadata).toHaveBeenCalledWith(TEST_ENV, "some thought");
  });

  it("runs dedup check with embedding", async () => {
    const db = mockDb();

    await remember(TEST_ENV, db, "some thought");

    expect(mockCheckSupersede).toHaveBeenCalledWith(
      TEST_ENV,
      db,
      "some thought",
      FAKE_EMBEDDING,
    );
  });

  it("rejects duplicates", async () => {
    const db = mockDb();
    mockCheckSupersede.mockResolvedValue({ isDuplicate: true });

    await expect(remember(TEST_ENV, db, "duplicate thought")).rejects.toThrow(
      "too similar to an existing memory",
    );
  });

  it("batches insert thought and FTS in a single write", async () => {
    const db = mockDb();
    const batch = vi.mocked(db.batch);

    await remember(TEST_ENV, db, "some thought");

    expect(batch).toHaveBeenCalledOnce();
    const [statements, mode] = batch.mock.calls[0];
    expect(mode).toBe("write");

    const stmts = statements as InStatement[];
    expect(stmts).toHaveLength(2);

    // First statement: INSERT INTO thoughts
    const insertStmt = stmts[0] as {
      sql: string;
      args: Record<string, unknown>;
    };
    expect(insertStmt.sql).toContain("INSERT INTO thoughts");
    expect(insertStmt.args.id).toBe("generated-id-abc");
    expect(insertStmt.args.content).toBe("some thought");
    expect(insertStmt.args.type).toBe("observation");
    expect(insertStmt.args.topics).toBe('["testing"]');

    // Second statement: INSERT INTO thought_fts
    const ftsStmt = stmts[1] as { sql: string; args: Record<string, unknown> };
    expect(ftsStmt.sql).toContain("INSERT INTO thought_fts");
    expect(ftsStmt.args.id).toBe("generated-id-abc");
  });

  it("handles superseded thoughts with atomic batch", async () => {
    const db = mockDb({
      batch: vi.fn().mockResolvedValue([
        { rows: [], rowsAffected: 1 },
        { rows: [], rowsAffected: 1 },
        { rows: [], rowsAffected: 1 },
        { rows: [], rowsAffected: 1 },
      ]),
    });
    const batch = vi.mocked(db.batch);

    mockCheckSupersede.mockResolvedValue({
      isDuplicate: false,
      supersedes: {
        id: "old123",
        content: "old thought",
        reason: "Updated with new info",
      },
    });

    const result = await remember(TEST_ENV, db, "new thought");

    expect(result.superseded).toEqual({
      id: "old123",
      reason: "Updated with new info",
    });

    const [statements] = batch.mock.calls[0];
    const stmts = statements as InStatement[];
    expect(stmts).toHaveLength(4);

    // Third statement: UPDATE old thought status
    const updateStmt = stmts[2] as {
      sql: string;
      args: Record<string, unknown>;
    };
    expect(updateStmt.sql).toContain("status = 'superseded'");
    expect(updateStmt.args.newId).toBe("generated-id-abc");
    expect(updateStmt.args.oldId).toBe("old123");

    // Fourth statement: DELETE old FTS entry
    const deleteFtsStmt = stmts[3] as {
      sql: string;
      args: Record<string, unknown>;
    };
    expect(deleteFtsStmt.sql).toContain("DELETE FROM thought_fts");
    expect(deleteFtsStmt.args.id).toBe("old123");
  });

  it("does not include supersede statements when nothing superseded", async () => {
    const db = mockDb();
    const batch = vi.mocked(db.batch);

    await remember(TEST_ENV, db, "fresh thought");

    const [statements] = batch.mock.calls[0];
    expect(statements).toHaveLength(2);
  });
});
