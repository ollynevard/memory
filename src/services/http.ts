import { RETRY } from "../constants";

export async function fetchWithRetry(
  input: RequestInfo,
  init: RequestInit,
  maxRetries = RETRY.MAX_RETRIES,
): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(input, init);

    if (response.ok || (response.status < 500 && response.status !== 429)) {
      return response;
    }

    if (attempt < maxRetries) {
      const delay = Math.min(
        RETRY.BASE_DELAY_MS * 2 ** attempt,
        RETRY.MAX_DELAY_MS,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    } else {
      return response;
    }
  }
  throw new Error("Unreachable");
}
