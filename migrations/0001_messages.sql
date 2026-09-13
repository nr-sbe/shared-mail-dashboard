CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_label TEXT NOT NULL,
  sender TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  UNIQUE(provider_id, source_id)
);
CREATE INDEX messages_expiry ON messages(expires_at);
CREATE INDEX messages_received ON messages(received_at DESC);

-- A short-lived tombstone stops webhook replays from restoring a removed message.
CREATE TABLE removed_messages (
  provider_id TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);
