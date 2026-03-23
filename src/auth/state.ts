import type { AuthRequest } from "@cloudflare/workers-oauth-provider";

export async function createOAuthState(
  oauthReqInfo: AuthRequest,
  kv: KVNamespace,
): Promise<string> {
  const stateToken = crypto.randomUUID();
  await kv.put(`oauth_state:${stateToken}`, JSON.stringify(oauthReqInfo), {
    expirationTtl: 600,
  });
  return stateToken;
}

export async function validateOAuthState(
  stateToken: string,
  kv: KVNamespace,
): Promise<AuthRequest> {
  const stored = await kv.get(`oauth_state:${stateToken}`);
  if (!stored) throw new Error("Invalid or expired OAuth state");
  await kv.delete(`oauth_state:${stateToken}`);
  return JSON.parse(stored) as AuthRequest;
}
