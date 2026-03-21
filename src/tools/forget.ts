import type { Env } from "../index";

export async function forget(_env: Env, _id: string) {
  // TODO: Soft delete
  // UPDATE thoughts SET status = 'deleted', deleted_at = now() WHERE id = ?
  throw new Error("Not implemented");
}
