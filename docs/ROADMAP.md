# Follow-up engineering work

## 1. Transactional outbox and Kafka

Problem: jobs are durable but there is no event contract or event delivery. Define versioned submitted/completed/failed events with job and correlation IDs. Persist events atomically with job changes. Add an outbox publisher and Kafka Compose service. Consumers must tolerate duplicates. Keep polling as an explicit supported mode or replace it with a documented delivery design.

Evidence: real PostgreSQL/Kafka integration tests for transaction rollback, broker outage/recovery, duplicate events, publisher crashes, ordering requirements and schema validation. Introduce a dedicated test command once implemented. Do not claim exactly-once external processing.

## 2. Cancellation

Define queued and active cancellation separately. Persist cancellation state, enforce valid transitions, and propagate cooperative abort to workers. Define cancellation versus completion races and whether cancellation consumes an attempt.

Evidence: integration tests for competing cancellation/completion, cancelled jobs never being claimed, and restart recovery. Existing submission/retry tests must remain green.

## 3. Controlled shutdown

Add a configurable drain deadline, shutdown status, and explicit handling of unfinished claims. Current worker stops claiming after a signal and waits for current runOne calls; it has no configurable drain policy.

Evidence: child-process tests with real signals, outstanding work, database failures and deadline expiry. Assert persisted state and successful recovery by a replacement worker.

## 4. Operational visibility

Expose attempt counters, queue age, retry counts, lease expirations, processing durations and structured worker logs with correlation IDs. Establish bounded metric labels. Do not use job IDs as metric labels.

## 5. Manual replay and pagination

Define a guarded dead → queued transition with an explicit retry-budget policy and attempt audit continuity. Add paginated job search with stable ordering and status filters.

Choose one coherent feature per task. These are technical backlog notes, not reviewer comments or study submission fields.
