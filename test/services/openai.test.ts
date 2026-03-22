import { describe, expect, it, vi } from "vitest";
import type { Env } from "../../src/index";
import {
  checkSupersede,
  extractMetadata,
  generateEmbedding,
  processThought,
} from "../../src/services/openai";

// The env bindings don't matter — OpenAI is mocked
const env = { OPENAI_API_KEY: "test-key" } as Env;

// Mock the OpenAI SDK
vi.mock("openai", () => {
  return {
    default: class {
      embeddings = {
        create: vi.fn().mockResolvedValue({
          data: [{ embedding: Array(1536).fill(0.1) }],
        }),
      };
      chat = {
        completions: {
          create: vi.fn().mockResolvedValue({
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
          }),
        },
      };
    },
  };
});

describe("generateEmbedding", () => {
  it("returns a 1536-dimensional embedding", async () => {
    const result = await generateEmbedding(env, "test thought");
    expect(result).toHaveLength(1536);
    expect(result[0]).toBe(0.1);
  });
});

describe("extractMetadata", () => {
  it("extracts metadata from content", async () => {
    const result = await extractMetadata(
      env,
      "Sarah suggested we use Postgres for the new project",
    );
    expect(result.type).toBe("decision");
    expect(result.topics).toEqual(["architecture", "database"]);
    expect(result.people).toEqual(["Sarah"]);
    expect(result.action_items).toEqual(["review schema"]);
  });
});

describe("processThought", () => {
  it("returns both embedding and metadata", async () => {
    const result = await processThought(env, "test thought");
    expect(result.embedding).toHaveLength(1536);
    expect(result.metadata.type).toBe("decision");
    expect(result.metadata.topics).toBeInstanceOf(Array);
  });
});

describe("checkSupersede", () => {
  it("returns supersede result", async () => {
    // Override the mock for this test
    const openai = await import("openai");
    const MockOpenAI = openai.default as unknown as {
      new (): {
        chat: {
          completions: {
            create: ReturnType<typeof vi.fn>;
          };
        };
      };
    };
    const instance = new MockOpenAI();
    instance.chat.completions.create.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              supersedes: true,
              reason: "new thought updates the old decision",
            }),
          },
        },
      ],
    });

    const result = await checkSupersede(
      env,
      "We should use Postgres",
      "Actually, we decided on Turso instead of Postgres",
    );
    expect(result).toHaveProperty("supersedes");
    expect(result).toHaveProperty("reason");
  });
});
