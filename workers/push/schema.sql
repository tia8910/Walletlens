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
