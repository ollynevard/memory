import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * fetchPublicKey is not exported directly, but is called internally by
 * verifyAccessToken. To test the JWKS caching behaviour in isolation we
 * need to call fetchPublicKey through verifyAccessToken while controlling
 * fetch, crypto.subtle.importKey, and crypto.subtle.verify.
 *
 * Strategy: build a minimal but structurally valid JWT so parseJWT succeeds,
 * mock crypto.subtle.importKey to return a sentinel CryptoKey, mock
 * crypto.subtle.verify to return true, and observe how many times
 * globalThis.fetch is called.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Encode a JSON object as an unpadded base64url string. */
function b64url(obj: Record<string, unknown>): string {
  const json = JSON.stringify(obj);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Build a fake three-part JWT with the given kid in the header. */
function fakeJwt(kid: string): string {
  const header = b64url({ kid, alg: "RS256" });
  const payload = b64url({
    sub: "user-1",
    email: "test@example.com",
    name: "Test User",
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  const signature = b64url({ fake: true });
  return `${header}.${payload}.${signature}`;
}

const JWKS_URL = "https://test.cloudflareaccess.com/cdn-cgi/access/certs";

function jwksResponse(kids: string[]) {
  return {
    keys: kids.map((kid) => ({
      kid,
      kty: "RSA",
      n: "fake-n",
      e: "AQAB",
    })),
  };
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch;
const sentinelKey = {} as CryptoKey;

let importKeySpy: ReturnType<typeof vi.fn>;
let verifySpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  globalThis.fetch = vi.fn();

  // crypto.subtle.importKey -> return a sentinel CryptoKey
  importKeySpy = vi
    .spyOn(crypto.subtle, "importKey")
    .mockResolvedValue(sentinelKey);

  // crypto.subtle.verify -> signature always valid
  verifySpy = vi.spyOn(crypto.subtle, "verify").mockResolvedValue(true);
});

afterEach(async () => {
  globalThis.fetch = originalFetch;
  importKeySpy.mockRestore();
  verifySpy.mockRestore();

  // Clear the module-level jwksCache between tests by re-importing a fresh
  // module. Vitest's vi.resetModules() + dynamic import achieves this.
  vi.resetModules();
});

function mockFetchJwks(kids: string[]) {
  vi.mocked(globalThis.fetch).mockResolvedValueOnce(
    new Response(JSON.stringify(jwksResponse(kids)), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

async function loadVerifyAccessToken() {
  const mod = await import("../../src/auth/jwt");
  return mod.verifyAccessToken;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("fetchPublicKey JWKS cache", () => {
  it("reuses cached key on second call with same kid (fetch called once)", async () => {
    const verifyAccessToken = await loadVerifyAccessToken();
    mockFetchJwks(["kid-a", "kid-b"]);

    await verifyAccessToken(JWKS_URL, fakeJwt("kid-a"));
    await verifyAccessToken(JWKS_URL, fakeJwt("kid-a"));

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("fetches again after TTL expires", async () => {
    const verifyAccessToken = await loadVerifyAccessToken();
    mockFetchJwks(["kid-a"]);

    await verifyAccessToken(JWKS_URL, fakeJwt("kid-a"));
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    // Advance time past the 1-hour TTL
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 60 * 60 * 1000 + 1);

    mockFetchJwks(["kid-a"]);
    await verifyAccessToken(JWKS_URL, fakeJwt("kid-a"));

    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("fetches again when requested kid is not in cached set", async () => {
    const verifyAccessToken = await loadVerifyAccessToken();
    // First fetch returns only kid-a
    mockFetchJwks(["kid-a"]);
    await verifyAccessToken(JWKS_URL, fakeJwt("kid-a"));
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    // Request kid-b which was not in the initial response -- triggers new fetch
    mockFetchJwks(["kid-a", "kid-b"]);
    await verifyAccessToken(JWKS_URL, fakeJwt("kid-b"));
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });
});
