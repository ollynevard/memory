import type { Client } from "@libsql/client/web";
import { createClient as createLibsqlClient } from "@libsql/client/web";

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

export function createClient(url: string, authToken: string): Client {
  return createLibsqlClient({ url, authToken });
}

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

export function generateId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
