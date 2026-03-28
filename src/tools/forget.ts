import type { Client } from "@libsql/client/web";

export async function forget(db: Client, id: string): Promise<boolean> {
  const results = await db.batch(
    [
      {
        sql: `UPDATE thoughts
              SET status = 'deleted', deleted_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
              WHERE id = :id AND status != 'deleted'`,
        args: { id },
      },
      {
        sql: `DELETE FROM thought_fts WHERE rowid = (SELECT rowid FROM thoughts WHERE id = :id)`,
        args: { id },
      },
    ],
    "write",
  );

  return results[0].rowsAffected > 0;
}
