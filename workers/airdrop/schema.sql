-- Generic key/value store, standing in for Deno KV.
--
-- voice-api makes about fifteen KV calls across two thousand lines that are
-- otherwise about Claude prompts and email. Keeping the KV SHAPE and swapping
-- the storage underneath (see kv.js) meant none of those call sites had to be
-- rewritten, which is where the risk in a port of this size actually lives.
--
-- Keys are the JSON array text of the Deno key, so ["guardian","device-1"] is
-- stored verbatim and a prefix scan is a LIKE against a literal prefix.
CREATE TABLE IF NOT EXISTS kv (
  k          TEXT PRIMARY KEY,
  v          TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- The guardian sweep and the weekly report both scan by prefix, so this is the
-- access path that matters. The PRIMARY KEY already indexes k; this covers
-- age-based queries if they are ever added.
CREATE INDEX IF NOT EXISTS idx_kv_updated ON kv (updated_at);
