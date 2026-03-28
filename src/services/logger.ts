export interface LogEntry {
  operation: string;
  duration_ms: number;
  [key: string]: unknown;
}

export function log(entry: LogEntry): void {
  console.log(JSON.stringify(entry));
}

export async function timed<T>(
  operation: string,
  fn: () => Promise<T>,
  extra?: Record<string, unknown>,
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    log({ operation, duration_ms: Date.now() - start, status: "ok", ...extra });
    return result;
  } catch (err) {
    log({
      operation,
      duration_ms: Date.now() - start,
      status: "error",
      error: err instanceof Error ? err.message : String(err),
      ...extra,
    });
    throw err;
  }
}
