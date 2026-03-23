import { Buffer } from "node:buffer";

interface JWTComponents {
  header: { kid: string; alg: string };
  payload: Record<string, unknown>;
  data: string;
  signature: string;
}

function parseJWT(token: string): JWTComponents {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("JWT must have 3 parts");
  return {
    header: JSON.parse(Buffer.from(parts[0], "base64url").toString()),
    payload: JSON.parse(Buffer.from(parts[1], "base64url").toString()),
    data: `${parts[0]}.${parts[1]}`,
    signature: parts[2],
  };
}

async function fetchPublicKey(jwksUrl: string, kid: string) {
  const resp = await fetch(jwksUrl);
  const keys = (await resp.json()) as {
    keys: (JsonWebKey & { kid: string })[];
  };
  const jwk = keys.keys.find((key) => key.kid === kid);
  if (!jwk) throw new Error(`No key found with kid: ${kid}`);
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { hash: "SHA-256", name: "RSASSA-PKCS1-v1_5" },
    false,
    ["verify"],
  );
}

export async function verifyAccessToken(
  jwksUrl: string,
  token: string,
): Promise<{ email: string; name: string; sub: string }> {
  const jwt = parseJWT(token);
  const key = await fetchPublicKey(jwksUrl, jwt.header.kid);
  const verified = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    Buffer.from(jwt.signature, "base64url"),
    Buffer.from(jwt.data),
  );
  if (!verified) throw new Error("JWT signature verification failed");

  const payload = jwt.payload;
  const exp = payload.exp as number;
  if (exp < Math.floor(Date.now() / 1000)) throw new Error("JWT expired");

  return {
    email: (payload.email as string) ?? "",
    name: (payload.name as string) ?? (payload.email as string) ?? "",
    sub: (payload.sub as string) ?? "",
  };
}
