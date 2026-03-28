import type { Client, Row } from "@libsql/client/web";
import { createClient as createLibsqlClient } from "@libsql/client/web";
import type { Env } from "../index";

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

export function createClient(env: Env): Client {
  return createLibsqlClient({
    url: env.TURSO_URL,
    authToken: env.TURSO_AUTH_TOKEN,
  });
}

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

export interface ThoughtRow {
  id: string;
  content: string;
  type: string;
  topics: string[];
  people: string[];
  created_at: string;
}

export interface SimilarRow {
  id: string;
  content: string;
  distance: number;
}

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

export function generateId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function statusFilter(includeSuperseded?: boolean): string {
  return includeSuperseded ? "status != 'deleted'" : "status = 'active'";
}

export function embeddingToJson(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

export function parseThoughtRow(row: Row): ThoughtRow {
  return {
    id: row.id as string,
    content: row.content as string,
    type: row.type as string,
    topics: JSON.parse((row.topics as string) ?? "[]"),
    people: JSON.parse((row.people as string) ?? "[]"),
    created_at: row.created_at as string,
  };
}
