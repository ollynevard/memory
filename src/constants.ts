/** Cosine similarity thresholds for deduplication and supersede checks. */
export const SIMILARITY = {
  /** At or above this, the thought is considered a duplicate and rejected. */
  DUPLICATE: 0.95,
  /** At or above this (below DUPLICATE), the LLM is asked whether the new thought supersedes the old. */
  SUPERSEDE: 0.85,
  /** Default minimum similarity for recall results. */
  RECALL_DEFAULT: 0.7,
} as const;

/** Days before a thought is flagged as stale, by type. */
export const STALENESS_DAYS = {
  decision: 180,
  task: 90,
  DEFAULT: 365,
} as const;

/** Input length and result count limits. */
export const LIMITS = {
  /** Maximum character length for a remember call. */
  REMEMBER_CONTENT: 50_000,
  /** Maximum character length for a recall query. */
  RECALL_QUERY: 10_000,
  /** Maximum results from recall. */
  RECALL_MAX: 50,
  /** Default result count for recall. */
  RECALL_DEFAULT: 10,
  /** Maximum results from browse. */
  BROWSE_MAX: 100,
  /** Default result count for browse. */
  BROWSE_DEFAULT: 20,
  /** How many similar thoughts to fetch for supersede checks. */
  SUPERSEDE_CANDIDATES: 5,
} as const;

/** Retry backoff parameters for OpenAI calls. */
export const RETRY = {
  /** Maximum number of retry attempts. */
  MAX_RETRIES: 3,
  /** Base delay in ms (doubles each attempt). */
  BASE_DELAY_MS: 1000,
  /** Maximum delay in ms. */
  MAX_DELAY_MS: 8000,
} as const;
