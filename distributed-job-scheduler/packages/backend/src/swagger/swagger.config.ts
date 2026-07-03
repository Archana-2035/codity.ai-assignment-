import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Distributed Job Scheduler API',
      version: '1.0.0',
      description: `
# Distributed Job Scheduler

A production-grade distributed job scheduling platform capable of reliably executing
asynchronous background jobs across multiple workers.

## Authentication
- **Bearer Token**: Use JWT token from \`/api/v1/auth/login\`
- **API Key**: Use \`X-Api-Key\` header with project API key for programmatic access

## Key Features
- Multiple job types: immediate, delayed, scheduled (cron), batch
- Atomic job claiming with \`SELECT FOR UPDATE SKIP LOCKED\`
- Configurable retry strategies: fixed, linear, exponential with jitter
- Dead Letter Queue (DLQ) for permanent failures
- Worker heartbeats and dead worker recovery
- Real-time updates via WebSocket
- Rate limiting per queue
- RBAC with organization/project scoping
      `,
      contact: {
        name: 'DJS Team',
        email: 'support@djs.example.com',
      },
      license: { name: 'MIT' },
    },
    servers: [
      { url: 'http://localhost:3000', description: 'Development' },
      { url: 'https://api.djs.example.com', description: 'Production' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
        apiKey: {
          type: 'apiKey',
          in: 'header',
          name: 'X-Api-Key',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: { type: 'string' },
          },
        },
        Job: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            queueId: { type: 'string', format: 'uuid' },
            type: { type: 'string' },
            payload: { type: 'object' },
            priority: { type: 'integer', minimum: 1, maximum: 10 },
            status: {
              type: 'string',
              enum: ['pending', 'scheduled', 'claimed', 'running', 'completed', 'failed', 'dead', 'cancelled'],
            },
            attemptCount: { type: 'integer' },
            maxAttempts: { type: 'integer' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Queue: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            priority: { type: 'integer' },
            concurrencyLimit: { type: 'integer' },
            isPaused: { type: 'boolean' },
            dlqEnabled: { type: 'boolean' },
          },
        },
        Worker: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            hostname: { type: 'string' },
            status: { type: 'string', enum: ['active', 'idle', 'draining', 'offline'] },
            concurrency: { type: 'integer' },
            currentJobCount: { type: 'integer' },
            lastHeartbeatAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    tags: [
      { name: 'Auth', description: 'Authentication and user management' },
      { name: 'Queues', description: 'Queue management' },
      { name: 'Jobs', description: 'Job submission and management' },
      { name: 'Workers', description: 'Worker management and job execution' },
      { name: 'DLQ', description: 'Dead Letter Queue management' },
    ],
  },
  apis: ['./src/**/*.routes.ts', './src/**/*.controller.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
