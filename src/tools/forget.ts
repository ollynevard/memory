import type { Client } from "@libsql/client/web";

export async function forget(db: Client, id: string): Promise<boolean> {
  const result = await db.execute({
    sql: `UPDATE thoughts
          SET status = 'deleted', deleted_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
          WHERE id = :id AND status != 'deleted'`,
    args: { id },
  });

  return result.rowsAffected > 0;
}
