import type { Client } from "@libsql/client/web";
import type { Env } from "../index";

export function createClient(_env: Env): Client {
  // TODO: Create Turso client with env.TURSO_URL and env.TURSO_AUTH_TOKEN
  throw new Error("Not implemented");
}
