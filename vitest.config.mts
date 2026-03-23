import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.toml" },
      miniflare: {
        bindings: {
          TURSO_URL: "http://localhost:8080",
          TURSO_AUTH_TOKEN: "test-token",
          OPENAI_API_KEY: "test-key",
          ACCESS_CLIENT_ID: "test-client-id",
          ACCESS_CLIENT_SECRET: "test-client-secret",
          ACCESS_TOKEN_URL:
            "https://test.cloudflareaccess.com/cdn-cgi/access/token",
          ACCESS_AUTHORIZATION_URL:
            "https://test.cloudflareaccess.com/cdn-cgi/access/authorize",
          ACCESS_JWKS_URL:
            "https://test.cloudflareaccess.com/cdn-cgi/access/certs",
        },
      },
    }),
  ],
});
