import type { Client } from "@libsql/client/web";
import { createClient as createLibsqlClient } from "@libsql/client/web";
import type { Env } from "../index";

export function createClient(env: Env): Client {
  return createLibsqlClient({
    url: env.TURSO_URL,
    authToken: env.TURSO_AUTH_TOKEN,
  });
}
