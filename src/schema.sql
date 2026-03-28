CREATE TABLE IF NOT EXISTS thoughts (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  content TEXT NOT NULL,
  embedding F32_BLOB(1536),
  type TEXT DEFAULT 'observation',
  topics TEXT DEFAULT '[]',
  people TEXT DEFAULT '[]',
  related TEXT DEFAULT '[]',
  action_items TEXT DEFAULT '[]',
  source TEXT DEFAULT 'claude',
  status TEXT DEFAULT 'active',     -- active | superseded | deleted
  superseded_by TEXT REFERENCES thoughts(id),
  deleted_at TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_thoughts_embedding
  ON thoughts (libsql_vector_idx(embedding));

CREATE VIRTUAL TABLE IF NOT EXISTS thought_fts USING fts5(
  content,
  content=thoughts,
  content_rowid=rowid
);

CREATE INDEX IF NOT EXISTS idx_thoughts_type ON thoughts(type);
CREATE INDEX IF NOT EXISTS idx_thoughts_status ON thoughts(status);
CREATE INDEX IF NOT EXISTS idx_thoughts_created ON thoughts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_thoughts_superseded_by ON thoughts(superseded_by);
