export interface ThoughtRow {
  id: string;
  content: string;
  type: string;
  topics: string[];
  people: string[];
  created_at: string;
}

export interface VectorSearchResult extends ThoughtRow {
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
  insert(thought: InsertThought): Promise<void>;
  insertAndSupersede(
    thought: InsertThought,
    supersedesId: string,
  ): Promise<void>;

  vectorSearch(
    embedding: number[],
    options: { limit: number; includeSuperseded?: boolean },
  ): Promise<VectorSearchResult[]>;

  ftsSearch(
    query: string,
    options: { limit: number; includeSuperseded?: boolean },
  ): Promise<ThoughtRow[]>;

  findSimilarActive(embedding: number[], limit: number): Promise<SimilarRow[]>;

  browse(options: {
    limit: number;
    type?: string;
    includeSuperseded?: boolean;
  }): Promise<ThoughtRow[]>;

  softDelete(id: string): Promise<boolean>;

  stats(): Promise<StatsResult>;
}
