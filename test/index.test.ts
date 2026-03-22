import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const TEST_SECRET = "a".repeat(64);

describe("memory server", () => {
  it("returns 401 without auth", async () => {
    const response = await SELF.fetch("https://memory.test/rpc", {
      method: "POST",
      body: JSON.stringify({ method: "ping" }),
    });
    expect(response.status).toBe(401);
  });

  it("accepts authenticated requests", async () => {
    const response = await SELF.fetch("https://memory.test/rpc", {
      method: "POST",
      headers: { Authorization: `Bearer ${TEST_SECRET}` },
      body: JSON.stringify({ method: "stats" }),
    });
    expect(response.status).toBe(200);
  });
});
