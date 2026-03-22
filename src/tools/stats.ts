import type { Client } from "@libsql/client/web";

export interface StatsResult {
  total: number;
  byType: Record<string, number>;
  superseded: number;
  mostRecent: string | null;
}

export async function stats(db: Client): Promise<StatsResult> {
  const [totalResult, typeResult, supersededResult, recentResult] =
    await Promise.all([
      db.execute(
        "SELECT COUNT(*) as count FROM thoughts WHERE status = 'active'",
      ),
      db.execute(
        "SELECT type, COUNT(*) as count FROM thoughts WHERE status = 'active' GROUP BY type",
      ),
      db.execute(
        "SELECT COUNT(*) as count FROM thoughts WHERE status = 'superseded'",
      ),
      db.execute(
        "SELECT created_at FROM thoughts WHERE status = 'active' ORDER BY created_at DESC LIMIT 1",
      ),
    ]);

  const byType: Record<string, number> = {};
  for (const row of typeResult.rows) {
    byType[row.type as string] = row.count as number;
  }

  return {
    total: totalResult.rows[0].count as number,
    byType,
    superseded: supersededResult.rows[0].count as number,
    mostRecent:
      recentResult.rows.length > 0
        ? (recentResult.rows[0].created_at as string)
        : null,
  };
}
