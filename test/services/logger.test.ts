import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { timed } from "../../src/services/logger";

let consoleSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  consoleSpy.mockRestore();
});

/** Parse the JSON string passed to the most recent console.log call. */
function lastLogEntry(): Record<string, unknown> {
  const calls = consoleSpy.mock.calls;
  return JSON.parse(calls[calls.length - 1][0] as string);
}

describe("timed", () => {
  it("returns the value from the wrapped function", async () => {
    const result = await timed("test-op", async () => 42);

    expect(result).toBe(42);
  });

  it("logs operation name and duration_ms on success", async () => {
    await timed("embed", async () => "ok");

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const entry = lastLogEntry();
    expect(entry.operation).toBe("embed");
    expect(entry.status).toBe("ok");
    expect(typeof entry.duration_ms).toBe("number");
    expect(entry.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it("logs error status when the function throws, then re-throws", async () => {
    const error = new Error("boom");

    await expect(
      timed("failing-op", async () => {
        throw error;
      }),
    ).rejects.toThrow("boom");

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const entry = lastLogEntry();
    expect(entry.operation).toBe("failing-op");
    expect(entry.status).toBe("error");
    expect(entry.error).toBe("boom");
    expect(typeof entry.duration_ms).toBe("number");
  });

  it("passes extra fields through to the log entry", async () => {
    await timed("recall", async () => "result", {
      user: "user-1",
      match_count: 5,
    });

    const entry = lastLogEntry();
    expect(entry.operation).toBe("recall");
    expect(entry.user).toBe("user-1");
    expect(entry.match_count).toBe(5);
  });
});
