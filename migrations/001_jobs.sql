CREATE TABLE IF NOT EXISTS jobs (
 id uuid PRIMARY KEY,
 idempotency_key text NOT NULL UNIQUE,
 request jsonb NOT NULL,
 correlation_id uuid NOT NULL,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','retry_wait','succeeded','dead')),
 attempts integer NOT NULL DEFAULT 0,
 max_attempts integer NOT NULL,
 available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 lease_until timestamptz,
 claim_token uuid,
 result jsonb,
 error text,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS jobs_ready ON jobs(available_at,created_at) WHERE status IN ('queued','retry_wait','running');
CREATE TABLE IF NOT EXISTS attempts (
 job_id uuid NOT NULL REFERENCES jobs(id), number integer NOT NULL,
 claim_token uuid NOT NULL, started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 finished_at timestamptz, outcome text, error text,
 PRIMARY KEY(job_id,number)
);
