import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ThoughtRepository } from "../src/repository";
import type { ChatModel, Embedder } from "../src/services/llm";

// Mock extractMetadata (still in openai.ts but now takes ChatModel)
vi.mock("../src/services/openai", () => ({
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
import { extractMetadata } from "../src/services/openai";
import { checkSupersede } from "../src/services/supersede";
import { remember } from "../src/tools/remember";

const mockExtractMetadata = vi.mocked(extractMetadata);
const mockCheckSupersede = vi.mocked(checkSupersede);
const mockGenerateId = vi.mocked(generateId);

const FAKE_EMBEDDING = Array.from({ length: 1536 }, () => 0.1);

const mockEmbedder: Embedder = {
  embed: vi
    .fn<(text: string) => Promise<number[]>>()
    .mockResolvedValue(FAKE_EMBEDDING),
};

const mockChat: ChatModel = {
  complete: vi.fn().mockResolvedValue("{}"),
};

function mockRepo(
  overrides: Partial<ThoughtRepository> = {},
): ThoughtRepository {
  return {
    insert: vi.fn().mockResolvedValue(undefined),
    insertAndSupersede: vi.fn().mockResolvedValue(undefined),
    vectorSearch: vi.fn().mockResolvedValue([]),
    ftsSearch: vi.fn().mockResolvedValue([]),
    findSimilarActive: vi.fn().mockResolvedValue([]),
    browse: vi.fn().mockResolvedValue([]),
    softDelete: vi.fn().mockResolvedValue(true),
    stats: vi.fn().mockResolvedValue({
      total: 0,
      byType: {},
      superseded: 0,
      mostRecent: null,
    }),
    ...overrides,
  };
}

describe("remember", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(mockEmbedder.embed).mockResolvedValue(FAKE_EMBEDDING);
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
    const repo = mockRepo();

    const result = await remember(
      mockEmbedder,
      mockChat,
      repo,
      "Vitest is great for testing",
    );

    expect(result).toEqual({
      id: "generated-id-abc",
      type: "observation",
      topics: ["testing"],
      people: [],
      action_items: [],
      superseded: undefined,
    });
  });

  it("calls embedder and extractMetadata in parallel", async () => {
    const repo = mockRepo();

    await remember(mockEmbedder, mockChat, repo, "some thought");

    expect(mockEmbedder.embed).toHaveBeenCalledWith("some thought");
    expect(mockExtractMetadata).toHaveBeenCalledWith(mockChat, "some thought");
  });

  it("runs dedup check with embedding", async () => {
    const repo = mockRepo();

    await remember(mockEmbedder, mockChat, repo, "some thought");

    expect(mockCheckSupersede).toHaveBeenCalledWith(
      mockChat,
      repo,
      "some thought",
      FAKE_EMBEDDING,
    );
  });

  it("rejects duplicates", async () => {
    const repo = mockRepo();
    mockCheckSupersede.mockResolvedValue({ isDuplicate: true });

    await expect(
      remember(mockEmbedder, mockChat, repo, "duplicate thought"),
    ).rejects.toThrow("too similar to an existing memory");
  });

  it("calls repo.insert for new thoughts", async () => {
    const repo = mockRepo();

    await remember(mockEmbedder, mockChat, repo, "some thought");

    expect(repo.insert).toHaveBeenCalledOnce();
    const thought = vi.mocked(repo.insert).mock.calls[0][0];
    expect(thought.id).toBe("generated-id-abc");
    expect(thought.content).toBe("some thought");
    expect(thought.type).toBe("observation");
    expect(thought.topics).toEqual(["testing"]);
    expect(thought.embedding).toBe(FAKE_EMBEDDING);
  });

  it("calls repo.insertAndSupersede when superseding", async () => {
    const repo = mockRepo();

    mockCheckSupersede.mockResolvedValue({
      isDuplicate: false,
      supersedes: {
        id: "old123",
        content: "old thought",
        reason: "Updated with new info",
      },
    });

    const result = await remember(mockEmbedder, mockChat, repo, "new thought");

    expect(result.superseded).toEqual({
      id: "old123",
      reason: "Updated with new info",
    });

    expect(repo.insertAndSupersede).toHaveBeenCalledOnce();
    const [thought, supersedesId] = vi.mocked(repo.insertAndSupersede).mock
      .calls[0];
    expect(thought.id).toBe("generated-id-abc");
    expect(thought.content).toBe("new thought");
    expect(supersedesId).toBe("old123");
  });

  it("does not call insertAndSupersede when nothing superseded", async () => {
    const repo = mockRepo();

    await remember(mockEmbedder, mockChat, repo, "fresh thought");

    expect(repo.insert).toHaveBeenCalledOnce();
    expect(repo.insertAndSupersede).not.toHaveBeenCalled();
  });
});
