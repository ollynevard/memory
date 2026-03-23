import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("memory server", () => {
  it("returns 401 for unauthenticated MCP requests", async () => {
    const response = await SELF.fetch("https://memory.test/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(response.status).toBe(401);
  });

  it("serves OAuth metadata at well-known endpoint", async () => {
    const response = await SELF.fetch(
      "https://memory.test/.well-known/oauth-authorization-server",
    );
    expect(response.status).toBe(200);
    const data = (await response.json()) as Record<string, unknown>;
    expect(data.authorization_endpoint).toContain("/authorize");
    expect(data.token_endpoint).toContain("/token");
    expect(data.registration_endpoint).toContain("/register");
  });

  it("redirects /authorize to Cloudflare Access", async () => {
    // First register a client to get a valid client_id
    const regResponse = await SELF.fetch("https://memory.test/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_name: "test-client",
        redirect_uris: ["http://localhost:6274/oauth/callback"],
      }),
    });
    expect(regResponse.status).toBe(201);
    const client = (await regResponse.json()) as { client_id: string };

    const authUrl = new URL("https://memory.test/authorize");
    authUrl.searchParams.set("client_id", client.client_id);
    authUrl.searchParams.set(
      "redirect_uri",
      "http://localhost:6274/oauth/callback",
    );
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("state", "test-state");
    authUrl.searchParams.set("code_challenge", "test-challenge");
    authUrl.searchParams.set("code_challenge_method", "S256");

    const response = await SELF.fetch(authUrl.toString(), {
      redirect: "manual",
    });
    expect(response.status).toBe(302);
    const location = response.headers.get("Location") ?? "";
    expect(location).toContain("test.cloudflareaccess.com");
  });
});
