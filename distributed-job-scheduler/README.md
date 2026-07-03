# Distributed Job Scheduler

A production-grade distributed job scheduling platform capable of reliably executing asynchronous background jobs across multiple workers. Built with Node.js, Express, PostgreSQL, Redis, and React.

## Features

- **Reliability:** Atomic job claiming using `SELECT ... FOR UPDATE SKIP LOCKED` (no duplicates).
- **Retry Strategies:** Fixed, Linear, Exponential with Jitter.
- **Dead Letter Queues:** Preserves permanently failed jobs for manual inspection/retry.
- **Workers:** Distributed workers with heartbeat monitoring and dead-worker job recovery.
- **Real-Time:** WebSockets push live status updates to the React dashboard.
- **Scheduling:** Immediate, delayed, and cron-based recurring schedules.
- **Bonus Implementations:** Rate limiting (Token Bucket), Idempotency, Workflow (Batches), Swagger Docs.

## Setup Instructions

### 1. Requirements
- Docker and Docker Compose
- Node.js (v18+)

### 2. Infrastructure Setup
Start PostgreSQL and Redis:
```bash
docker-compose up -d
```

### 3. Application Setup

Install dependencies across the monorepo:
```bash
npm install
```

Build the shared package (Required for backend/worker/frontend):
```bash
npm run build -w packages/shared
```

Run database migrations and seed (creates demo users & data):
```bash
npm run db:migrate -w packages/backend
npm run db:seed -w packages/backend
```

### 4. Run the Cluster

Start all services (Backend API, Worker, React Frontend) concurrently:
```bash
npm run dev
```

### 5. Access Interfaces

- **Frontend Dashboard:** http://localhost:5173
  - *Login:* admin@djs.dev
  - *Password:* Admin@1234
- **API Documentation (Swagger):** http://localhost:3000/api/docs
- **Backend API Base:** http://localhost:3000/api/v1

## Architecture

See `docs/architecture.md` and `docs/er-diagram.md` for sequence diagrams and database schemas.
