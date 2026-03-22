import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// workers-mcp requires SHARED_SECRET to be exactly 64 characters
const TEST_SECRET = "a".repeat(64);

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.toml" },
      miniflare: {
        bindings: {
          SHARED_SECRET: TEST_SECRET,
          TURSO_URL: "http://localhost:8080",
          TURSO_AUTH_TOKEN: "test-token",
          OPENAI_API_KEY: "test-key",
        },
      },
    }),
  ],
});
