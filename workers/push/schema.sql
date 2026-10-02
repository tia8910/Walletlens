-- One row per push subscription.
--
-- The Deno service stored these in Deno KV under ["sub", <hash>]. The shape is
-- carried over verbatim — the whole record as JSON under the same hashed key —
-- so the porting risk stays in the storage layer instead of spreading into the
-- notification logic, which is unchanged and still unit-tested.
--
-- What is stored is the privacy-minimal set required to push: an anonymous
-- endpoint and its keys, the user's alert rules, and the IDENTIFIERS of the
-- assets they track. No amounts, no portfolio value, no identity.
CREATE TABLE IF NOT EXISTS subs (
  key        TEXT PRIMARY KEY,   -- endpointKey(): first 24 hex of SHA-256(endpoint)
  data       TEXT NOT NULL,      -- the record, as JSON
  updated_at INTEGER NOT NULL
);

-- The crons read every row on each scan, so this is the access path that
-- matters. Reading a covering index rather than the table keeps the scan off
-- the JSON blob when only the key is needed.
CREATE INDEX IF NOT EXISTS idx_subs_updated ON subs (updated_at);

-- AI answers reported from the app ("Report an issue"). Reviewed by a person
-- at /admin/reports. src is a salted per-day hash of the sender's address,
-- kept only for rate limiting; no portfolio and no identity is stored.
CREATE TABLE IF NOT EXISTS ai_reports (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  at      INTEGER NOT NULL,
  surface TEXT NOT NULL,
  reason  TEXT NOT NULL,
  note    TEXT,
  output  TEXT NOT NULL,
  lang    TEXT,
  src     TEXT,
  status  TEXT NOT NULL DEFAULT 'new'
);
CREATE INDEX IF NOT EXISTS idx_ai_reports_at ON ai_reports (at);
CREATE INDEX IF NOT EXISTS idx_ai_reports_src ON ai_reports (src, at);
