-- Drizzle's `timestamp` integer mode stores Unix seconds. Scanner builds before
-- this migration wrote JavaScript milliseconds directly through raw SQLite.
UPDATE samples
SET created_at = CAST(created_at / 1000 AS INTEGER)
WHERE created_at >= 100000000000;

UPDATE samples
SET modified_at = CAST(modified_at / 1000 AS INTEGER)
WHERE modified_at >= 100000000000;
