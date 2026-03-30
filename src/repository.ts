export interface Thought {
  id: string;
  content: string;
  type: string;
  topics: string[];
  people: string[];
  created_at: string;
}

export interface VectorSearchResult extends Thought {
  distance: number;
}

export interface SimilarRow {
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
}

export interface StatsResult {
  total: number;
  byType: Record<string, number>;
  superseded: number;
  mostRecent: string | null;
}

export interface ThoughtRepository {
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
  findSimilarActive(embedding: number[], limit: number): Promise<SimilarRow[]>;

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
