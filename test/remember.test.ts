import type { Client } from "@libsql/client/web";
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
  updateSupersededBy: vi.fn(),
}));

import { embed, extractMetadata } from "../src/services/openai";
import { checkSupersede, updateSupersededBy } from "../src/services/supersede";
import { remember } from "../src/tools/remember";

const mockEmbed = vi.mocked(embed);
const mockExtractMetadata = vi.mocked(extractMetadata);
const mockCheckSupersede = vi.mocked(checkSupersede);
const mockUpdateSupersededBy = vi.mocked(updateSupersededBy);

const TEST_ENV = {
  OPENAI_API_KEY: "test-key",
  TURSO_URL: "http://localhost:8080",
  TURSO_AUTH_TOKEN: "test-token",
} as unknown as Env;

const FAKE_EMBEDDING = Array.from({ length: 1536 }, () => 0.1);

function mockDb(overrides: Partial<Client> = {}): Client {
  return {
    execute: vi.fn().mockResolvedValue({
      rows: [{ id: "abc123" }],
      columns: ["id"],
      columnTypes: ["TEXT"],
      rowsAffected: 1,
      lastInsertRowid: undefined,
    }),
    batch: vi.fn(),
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
    mockUpdateSupersededBy.mockResolvedValue(undefined);
  });

  it("stores a thought and returns metadata", async () => {
    const db = mockDb();

    const result = await remember(TEST_ENV, db, "Vitest is great for testing");

    expect(result).toEqual({
      id: "abc123",
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

  it("inserts thought with embedding and metadata", async () => {
    const db = mockDb();
    const execute = vi.mocked(db.execute);

    await remember(TEST_ENV, db, "some thought");

    // First call: INSERT INTO thoughts
    const insertCall = execute.mock.calls.find(
      (call) =>
        typeof call[0] === "object" &&
        (call[0] as { sql: string }).sql.includes("INSERT INTO thoughts"),
    );
    expect(insertCall).toBeDefined();

    const insertArgs = (
      insertCall?.[0] as unknown as { args: Record<string, unknown> }
    ).args;
    expect(insertArgs.content).toBe("some thought");
    expect(insertArgs.type).toBe("observation");
    expect(insertArgs.topics).toBe('["testing"]');
  });

  it("syncs FTS index after insert", async () => {
    const db = mockDb();
    const execute = vi.mocked(db.execute);

    await remember(TEST_ENV, db, "some thought");

    const ftsCall = execute.mock.calls.find(
      (call) =>
        typeof call[0] === "object" &&
        (call[0] as { sql: string }).sql.includes("INSERT INTO thought_fts"),
    );
    expect(ftsCall).toBeDefined();
  });

  it("handles superseded thoughts", async () => {
    const db = mockDb();
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
    expect(mockUpdateSupersededBy).toHaveBeenCalledWith(db, "old123", "abc123");
  });

  it("does not call updateSupersededBy when nothing superseded", async () => {
    const db = mockDb();

    await remember(TEST_ENV, db, "fresh thought");

    expect(mockUpdateSupersededBy).not.toHaveBeenCalled();
  });
});
