-- D1 schema for conversations/messages
CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(conversation_id) REFERENCES conversations(id)
);

-- Index for session lookups and example insert
CREATE INDEX IF NOT EXISTS idx_conversations_session_id ON conversations(session_id);

-- Example insert for testing:
-- INSERT INTO conversations (session_id, started_at, ended_at) VALUES ('test-session', 1690000000000, 1690000001000);
