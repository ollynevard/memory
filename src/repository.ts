export interface Thought {
  id: string;
  content: string;
  type: string;
  topics: string[];
  people: string[];
  createdAt: string;
}

export interface VectorSearchResult extends Thought {
  distance: number;
}

export interface SimilarThought {
  id: string;
  content: string;
  distance: number;
}

export interface InsertThought {
  id: string;
  content: string;
  embedding: number[];
  type: string;
  topics: string[];
  people: string[];
  action_items: string[];
  dates_mentioned: string[];
  content_fingerprint: string;
  source: string;
}

export interface StatsResult {
  total: number;
  byType: Record<string, number>;
  superseded: number;
  mostRecent: string | null;
}

export interface ThoughtRepository {
  /** Returns true if an active thought with this fingerprint already exists. */
  existsByFingerprint(fingerprint: string): Promise<boolean>;

  /** Atomically inserts the thought and syncs the FTS index. */
  insert(thought: InsertThought): Promise<void>;

  /** Atomically inserts a new thought, marks the superseded thought, and updates both FTS entries. */
  insertAndSupersede(
    thought: InsertThought,
    supersedesId: string,
  ): Promise<void>;

  /** Cosine similarity search. Results are ordered nearest-first; distance is raw cosine distance (similarity = 1 - distance). */
  vectorSearch(
    embedding: number[],
    options: { limit: number; includeSuperseded?: boolean },
  ): Promise<VectorSearchResult[]>;

  /** Full-text search via FTS5 MATCH. Results are ordered by rank. */
  ftsSearch(
    query: string,
    options: { limit: number; includeSuperseded?: boolean },
  ): Promise<Thought[]>;

  /** Vector search restricted to active thoughts only. Used for duplicate/supersede detection. */
  findSimilarActive(
    embedding: number[],
    limit: number,
  ): Promise<SimilarThought[]>;

  /** Lists recent thoughts in reverse chronological order, with optional type filtering. */
  browse(options: {
    limit: number;
    type?: string;
    includeSuperseded?: boolean;
  }): Promise<Thought[]>;

  /** Soft-deletes by setting status and cleaning up FTS. Returns false if the thought was already deleted or not found. */
  softDelete(id: string): Promise<boolean>;

  /** Returns aggregate counts: total active, breakdown by type, superseded count, and most recent timestamp. */
  stats(): Promise<StatsResult>;
}
