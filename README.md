# Tasklane Service

A TypeScript backend for persistent background report processing. Separate Fastify API and polling worker processes share PostgreSQL. This is a functional development baseline, not a production service.

## Implemented

- Validated job submission and lookup APIs with correlation IDs.
- Database-enforced idempotency: replay returns the original job; conflicting input returns 409.
- Persistent state lifecycle: queued → running → succeeded, or retry_wait → running → dead after exhaustion.
- Concurrent worker claims using transactions and FOR UPDATE SKIP LOCKED.
- Worker leases and claim-token fencing prevent stale workers from overwriting recovered work.
- Attempt history, bounded exponential retry delays, execution timeout, and expired-lease recovery.
- Database readiness and process liveness endpoints.
- API and worker tests, a real PostgreSQL integration suite, local Docker Compose.

## Windows quick start

Requires Node.js 24+, Docker Desktop running with Linux containers, and npm. Run from the directory containing this README and package.json. The ZIP opens directly into project files, without an extra nested project folder.

```powershell
npm.cmd ci
Copy-Item .env.example .env
docker compose up -d --wait
npm.cmd run migrate
npm.cmd run typecheck
npm.cmd test
npm.cmd run test:integration
```

Start API in one terminal:

```powershell
npm.cmd start
```

Start worker in another terminal in the same folder:

```powershell
npm.cmd run worker
```

Submit synthetic work from a third PowerShell terminal:

```powershell
$body = @{ type = 'report'; payload = @{ values = @(10, 20, 30) } } | ConvertTo-Json -Depth 4
$job = Invoke-RestMethod -Method Post -Uri http://localhost:3000/jobs -ContentType application/json -Headers @{ 'Idempotency-Key' = 'report-001' } -Body $body
Invoke-RestMethod "http://localhost:3000/jobs/$($job.id)"
Invoke-RestMethod "http://localhost:3000/jobs/$($job.id)/attempts"
```

Repeat the GET until status is succeeded. Expected result: count 3, sum 60, average 20. Repeat POST with the same key and input: the same ID is returned. Change values while keeping the key: expect HTTP 409. Restart API and worker: stored jobs remain. Pending/expired jobs are picked up by workers.

Stop processes with Ctrl+C, then `docker compose stop`. Avoid `docker compose down -v` unless you intend to delete all local job data. Compose credentials are disposable local development values, not real secrets. The API binds only to localhost and has no authentication.

## Commands and evidence

- `npm.cmd test`: API/worker unit tests; no database required.
- `npm.cmd run typecheck`: checks API, storage, worker and tests.
- `npm.cmd run test:integration`: requires a running PostgreSQL instance and .env. Uses an isolated temporary schema; verifies idempotency, competing claims, retry delays, exhaustion, expired lease recovery and stale completion rejection. Fails rather than silently skipping if PostgreSQL is unavailable.

Validation in the delivery environment: API/worker tests and type checking were run. PostgreSQL integration tests were not run because neither Docker nor PostgreSQL was installed. Run the integration command before relying on database behaviour.

## Architecture

API → PostgreSQL jobs → polling workers → report processor → persisted result/attempts.

`src/api.ts` holds HTTP contracts, `src/store.ts` owns transactional state changes, `src/worker.ts` executes one claimed attempt, and entry points run the API and bounded worker loops separately. The report processor operates on synthetic numeric arrays only.

Processing is at least once: a worker crash or lease expiry can cause repeat execution. Fencing protects database outcomes, not arbitrary external side effects. A timeout signals cancellation but cannot forcibly stop non-cooperative JavaScript or CPU-bound code. Processors must be bounded and side-effect safe. No heartbeat is implemented; the lease exceeds the processing timeout by five seconds. Current handlers finish promptly. Persisted errors are truncated, but do not submit sensitive values. The service is intended for local use.

## Reserved follow-up features

See docs/ROADMAP.md. Kafka, outbox delivery, cancellation, manual replay, metrics and configurable shutdown are intentionally outside this baseline. There are no fake implementations or deliberately inserted bugs. Existing work uses database polling and works independently of these features.
