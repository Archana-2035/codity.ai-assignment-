# Design Decisions and Trade-offs

## 1. Relational Database (PostgreSQL) vs. Redis/Message Queue
**Decision**: Use PostgreSQL as the primary data store and queue mechanism.
**Rationale**: Job schedulers require complex state machines, querying, indexing, foreign key constraints (e.g., jobs tied to projects), and strict ACID transactions. While RabbitMQ or Redis lists are faster for pure throughput, they lack robust querying capabilities (e.g., "list all failed jobs for project X").
**Trade-off**: Slightly lower maximum throughput compared to in-memory queues.
**Mitigation**: Used `SELECT ... FOR UPDATE SKIP LOCKED` which provides highly concurrent queue semantics directly inside Postgres, avoiding deadlocks.

## 2. Distributed Locking vs. Database Locking
**Decision**: Use Redis for distributed locking (Scheduler Service) and rate limiting, but Postgres row-locks for job execution.
**Rationale**: The cron scheduler runs every 10 seconds. If 5 backend API nodes exist, we only want *one* to dispatch jobs to prevent duplicate insertions. Redis `SETNX` acts as a rapid consensus mechanism. But for the actual workers claiming jobs, row-level locking (`SKIP LOCKED`) in the DB is far superior as it inherently binds the transaction to the state mutation (status='claimed').

## 3. Worker Node Architecture (Pull vs. Push)
**Decision**: Workers *poll* (pull) the backend API for jobs instead of the backend pushing to them via WebSockets/RPC.
**Rationale**: Pull-based models provide automatic backpressure. If a worker can only handle 10 concurrent jobs, it will only request jobs when it has capacity. If the API pushed jobs, we'd need complex load-balancing and capacity-tracking algorithms on the backend.
**Trade-off**: Polling introduces slight latency (up to the poll interval bounds) empty-cycle overhead.

## 4. Single Monorepo
**Decision**: Structure as a single NPM workspace monorepo (backend, worker, frontend, shared).
**Rationale**: Prevents drift between TypeScript definitions for API payloads, database models, and WebSocket events. Standardizes the tech stack (Node/TS).

## 5. Dead-worker Detection (Heartbeats)
**Decision**: Soft-state heartbeat pattern. Workers ping the API every `N` seconds. If `current time - last_heartbeat > threshold`, worker is deemed dead.
**Rationale**: Distributed systems cannot rely on graceful disconnects (e.g., OOM kill, network partition, hard crash). The central API must autonomously sweep orphaned jobs.

## 6. Authentication Strategy
**Decision**: Short-lived JWTs (15 min) stored in memory/JS via API response, long-lived Refresh Tokens stored in DB.
**Rationale**: Allows instant revocation of compromised sessions by deleting the refresh token while minimizing DB queries on standard requests. Additionally, projects utilize long-lived API Keys (`sk_...`) specifically for programmatic access.
