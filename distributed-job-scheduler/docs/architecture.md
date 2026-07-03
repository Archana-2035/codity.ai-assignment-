# Architecture Overview

```mermaid
graph TD
    Client[Web Dashboard / REST Clients]
    LB[Load Balancer / Reverse Proxy]
    
    subgraph "Backend API Instances"
        API1[Express API Route]
        API2[Express API Route]
        Scheduler[Scheduler Service]
        WS[WebSocket Server]
    end
    
    subgraph "Worker Nodes (Horizontally Scalable)"
        W1[Worker 1]
        W2[Worker 2]
        W3[Worker N...]
    end
    
    DB[(PostgreSQL 15)]
    Redis[(Redis 7)]
    
    Client -->|HTTPS / REST| LB
    Client -.->|WSS Events| LB
    
    LB --> API1
    LB --> API2
    LB -.-> WS
    
    API1 -->|Read/Write Jobs| DB
    API2 -->|Read/Write Jobs| DB
    Scheduler -->|Poll/Promote| DB
    
    API1 -.->|Publish Status| Redis
    WS -.->|Subscribe Status| Redis
    Scheduler -.->|Acquire SetNX Lock| Redis
    API1 -.->|Rate Limit Check| Redis
    
    W1 -->|Atomic CLAIM (FOR UPDATE SKIP LOCKED)| DB
    W2 -->|Atomic CLAIM (FOR UPDATE SKIP LOCKED)| DB
    W3 -->|Atomic CLAIM (FOR UPDATE SKIP LOCKED)| DB
    
    W1 -.->|Heartbeat Ping| API1
    W1 -.->|Event Trigger| API1
```

## Workflows

### 1. Atomic Job Claiming
When a worker attempts to claim a job, it issues:
`SELECT ... FROM jobs WHERE status = 'pending' ... FOR UPDATE SKIP LOCKED LIMIT 1;`
This allows multiple workers to request jobs simultaneously. If Worker A locks Job 1, Worker B's query will immediately skip Job 1 and lock Job 2, entirely preventing deadlock and duplicate execution.

### 2. Dead Worker Recovery
Each worker sends a heartbeat every 5s. The backend API validates heartbeats. A background task runs every 30s finding workers with heartbeats older than 30s. It marks them `offline` and automatically rewrites their `running`/`claimed` jobs back to `pending`.

### 3. Real-Time Status Push
When a job is completed or fails, the API updates PostgreSQL and pushes an event to a Redis Pub/Sub channel. The WebSocket server (on the API nodes) listens to Redis and relays this event out to the connected frontend clients, enabling a live UI without polling the DB.
