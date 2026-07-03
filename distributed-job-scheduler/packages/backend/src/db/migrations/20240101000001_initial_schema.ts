import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Enable UUID generation
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "pg_trgm"');

  // ──────────────────────────────────────────────
  // ENUM TYPES
  // ──────────────────────────────────────────────
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE user_role AS ENUM ('admin', 'member');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE org_role AS ENUM ('owner', 'admin', 'member');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE job_status AS ENUM ('pending', 'scheduled', 'claimed', 'running', 'completed', 'failed', 'dead', 'cancelled');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE execution_status AS ENUM ('running', 'completed', 'failed');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE worker_status AS ENUM ('active', 'idle', 'draining', 'offline');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE retry_strategy AS ENUM ('fixed', 'linear', 'exponential');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE log_level AS ENUM ('debug', 'info', 'warn', 'error');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE batch_status AS ENUM ('pending', 'running', 'completed', 'failed', 'partial');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE workflow_status AS ENUM ('pending', 'running', 'completed', 'failed', 'cancelled');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);

  // ──────────────────────────────────────────────
  // USERS
  // ──────────────────────────────────────────────
  await knex.schema.createTable('users', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('email', 255).notNullable().unique();
    table.string('password_hash', 255).notNullable();
    table.specificType('role', 'user_role').notNullable().defaultTo('member');
    table.boolean('is_active').notNullable().defaultTo(true);
    table.string('refresh_token', 500);
    table.timestamps(true, true);

    table.index(['email']);
  });

  // ──────────────────────────────────────────────
  // ORGANIZATIONS
  // ──────────────────────────────────────────────
  await knex.schema.createTable('organizations', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('name', 255).notNullable();
    table.string('slug', 100).notNullable().unique();
    table.text('description');
    table.timestamps(true, true);

    table.index(['slug']);
  });

  // ──────────────────────────────────────────────
  // ORGANIZATION MEMBERS
  // ──────────────────────────────────────────────
  await knex.schema.createTable('organization_members', (table) => {
    table.uuid('org_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.specificType('role', 'org_role').notNullable().defaultTo('member');
    table.timestamps(true, true);

    table.primary(['org_id', 'user_id']);
    table.index(['user_id']);
  });

  // ──────────────────────────────────────────────
  // RETRY POLICIES
  // ──────────────────────────────────────────────
  await knex.schema.createTable('retry_policies', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('name', 100).notNullable();
    table.specificType('strategy', 'retry_strategy').notNullable().defaultTo('exponential');
    table.integer('max_attempts').notNullable().defaultTo(3);
    table.integer('initial_delay_ms').notNullable().defaultTo(1000);
    table.integer('max_delay_ms').notNullable().defaultTo(300000); // 5 min
    table.float('multiplier').notNullable().defaultTo(2.0);
    table.boolean('jitter').notNullable().defaultTo(true);
    table.timestamps(true, true);
  });

  // ──────────────────────────────────────────────
  // PROJECTS
  // ──────────────────────────────────────────────
  await knex.schema.createTable('projects', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('org_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    table.string('name', 255).notNullable();
    table.string('slug', 100).notNullable();
    table.text('description');
    table.string('api_key', 128).notNullable().unique();
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamps(true, true);

    table.unique(['org_id', 'slug']);
    table.index(['org_id']);
    table.index(['api_key']);
  });

  // ──────────────────────────────────────────────
  // QUEUES
  // ──────────────────────────────────────────────
  await knex.schema.createTable('queues', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('project_id').notNullable().references('id').inTable('projects').onDelete('CASCADE');
    table.string('name', 100).notNullable();
    table.text('description');
    table.integer('priority').notNullable().defaultTo(5); // 1=highest, 10=lowest
    table.integer('concurrency_limit').notNullable().defaultTo(10);
    table.uuid('retry_policy_id').references('id').inTable('retry_policies').onDelete('SET NULL');
    table.boolean('is_paused').notNullable().defaultTo(false);
    table.integer('rate_limit_per_minute');
    table.integer('max_job_age_days');
    table.boolean('dlq_enabled').notNullable().defaultTo(true);
    table.integer('shard_count').defaultTo(1);
    table.timestamps(true, true);

    table.unique(['project_id', 'name']);
    table.index(['project_id']);
    table.index(['priority']);
  });

  // ──────────────────────────────────────────────
  // WORKFLOWS
  // ──────────────────────────────────────────────
  await knex.schema.createTable('workflows', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('name', 255).notNullable();
    table.uuid('project_id').notNullable().references('id').inTable('projects').onDelete('CASCADE');
    table.specificType('status', 'workflow_status').notNullable().defaultTo('pending');
    table.jsonb('definition').notNullable();
    table.uuid('created_by').references('id').inTable('users').onDelete('SET NULL');
    table.timestamp('completed_at', { useTz: true });
    table.timestamps(true, true);

    table.index(['project_id', 'status']);
  });

  // ──────────────────────────────────────────────
  // JOB BATCHES
  // ──────────────────────────────────────────────
  await knex.schema.createTable('job_batches', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('name', 255).notNullable();
    table.uuid('queue_id').notNullable().references('id').inTable('queues').onDelete('CASCADE');
    table.uuid('created_by').references('id').inTable('users').onDelete('SET NULL');
    table.integer('total_jobs').notNullable().defaultTo(0);
    table.integer('pending_count').notNullable().defaultTo(0);
    table.integer('completed_count').notNullable().defaultTo(0);
    table.integer('failed_count').notNullable().defaultTo(0);
    table.specificType('status', 'batch_status').notNullable().defaultTo('pending');
    table.jsonb('options').defaultTo('{}');
    table.timestamp('completed_at', { useTz: true });
    table.timestamps(true, true);

    table.index(['queue_id', 'status']);
    table.index(['created_by']);
  });

  // ──────────────────────────────────────────────
  // JOBS
  // ──────────────────────────────────────────────
  await knex.schema.createTable('jobs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('queue_id').notNullable().references('id').inTable('queues').onDelete('CASCADE');
    table.uuid('project_id').notNullable().references('id').inTable('projects').onDelete('CASCADE');
    table.string('type', 100).notNullable();
    table.jsonb('payload').notNullable().defaultTo('{}');
    table.integer('priority').notNullable().defaultTo(5);
    table.specificType('status', 'job_status').notNullable().defaultTo('pending');
    table.timestamp('scheduled_at', { useTz: true });
    table.timestamp('run_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('started_at', { useTz: true });
    table.timestamp('completed_at', { useTz: true });
    table.timestamp('claimed_at', { useTz: true });
    table.integer('attempt_count').notNullable().defaultTo(0);
    table.integer('max_attempts').notNullable().defaultTo(3);
    table.string('idempotency_key', 255);
    table.uuid('batch_id').references('id').inTable('job_batches').onDelete('SET NULL');
    table.uuid('workflow_id').references('id').inTable('workflows').onDelete('SET NULL');
    table.uuid('parent_job_id').references('id').inTable('jobs').onDelete('SET NULL');
    table.uuid('worker_id'); // soft ref, worker may be gone
    table.uuid('created_by').references('id').inTable('users').onDelete('SET NULL');
    table.text('failure_reason');
    table.integer('shard_key').defaultTo(0);
    table.timestamps(true, true);

    // Critical indexes for job claiming performance
    table.index(['queue_id', 'status', 'run_at']); // Main claim index
    table.index(['status', 'run_at']);              // System-wide status monitor
    table.index(['batch_id']);
    table.index(['workflow_id']);
    table.index(['parent_job_id']);
    table.index(['worker_id']);
    table.index(['created_at']);
  });

  // Unique idempotency key per queue
  await knex.raw(`
    CREATE UNIQUE INDEX jobs_idempotency_key_queue_unique
    ON jobs (queue_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL
  `);

  // Partial index for fast pending job queries
  await knex.raw(`
    CREATE INDEX jobs_pending_idx ON jobs (queue_id, priority ASC, run_at ASC)
    WHERE status = 'pending'
  `);

  // ──────────────────────────────────────────────
  // JOB EXECUTIONS
  // ──────────────────────────────────────────────
  await knex.schema.createTable('job_executions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('job_id').notNullable().references('id').inTable('jobs').onDelete('CASCADE');
    table.uuid('worker_id').notNullable();
    table.integer('attempt_number').notNullable();
    table.specificType('status', 'execution_status').notNullable().defaultTo('running');
    table.timestamp('started_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('completed_at', { useTz: true });
    table.integer('duration_ms');
    table.jsonb('result');
    table.text('error_message');
    table.text('error_stack');
    table.timestamps(true, true);

    table.index(['job_id']);
    table.index(['worker_id']);
    table.index(['status', 'started_at']);
  });

  // ──────────────────────────────────────────────
  // JOB LOGS
  // ──────────────────────────────────────────────
  await knex.schema.createTable('job_logs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('job_id').notNullable().references('id').inTable('jobs').onDelete('CASCADE');
    table.uuid('execution_id').references('id').inTable('job_executions').onDelete('CASCADE');
    table.specificType('level', 'log_level').notNullable().defaultTo('info');
    table.text('message').notNullable();
    table.jsonb('metadata');
    table.timestamp('logged_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['job_id', 'logged_at']);
    table.index(['execution_id']);
  });

  // ──────────────────────────────────────────────
  // WORKERS
  // ──────────────────────────────────────────────
  await knex.schema.createTable('workers', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('hostname', 255).notNullable();
    table.integer('pid').notNullable();
    table.specificType('queue_ids', 'uuid[]').notNullable().defaultTo('{}');
    table.specificType('status', 'worker_status').notNullable().defaultTo('idle');
    table.integer('concurrency').notNullable().defaultTo(5);
    table.integer('current_job_count').notNullable().defaultTo(0);
    table.timestamp('last_heartbeat_at', { useTz: true });
    table.timestamp('registered_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.string('version', 50);
    table.jsonb('metadata').defaultTo('{}');
    table.timestamps(true, true);

    table.index(['status']);
    table.index(['last_heartbeat_at']);
  });

  // ──────────────────────────────────────────────
  // WORKER HEARTBEATS
  // ──────────────────────────────────────────────
  await knex.schema.createTable('worker_heartbeats', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('worker_id').notNullable().references('id').inTable('workers').onDelete('CASCADE');
    table.specificType('status', 'worker_status').notNullable();
    table.integer('current_job_count').notNullable().defaultTo(0);
    table.jsonb('metadata');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['worker_id', 'created_at']);
  });

  // ──────────────────────────────────────────────
  // SCHEDULED JOBS
  // ──────────────────────────────────────────────
  await knex.schema.createTable('scheduled_jobs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('queue_id').notNullable().references('id').inTable('queues').onDelete('CASCADE');
    table.string('type', 100).notNullable();
    table.jsonb('payload').notNullable().defaultTo('{}');
    table.string('cron_expression', 100);
    table.timestamp('next_run_at', { useTz: true }).notNullable();
    table.timestamp('last_run_at', { useTz: true });
    table.boolean('is_active').notNullable().defaultTo(true);
    table.string('name', 255).notNullable();
    table.text('description');
    table.string('timezone', 100).notNullable().defaultTo('UTC');
    table.integer('max_attempts').notNullable().defaultTo(3);
    table.uuid('created_by').references('id').inTable('users').onDelete('SET NULL');
    table.timestamps(true, true);

    table.index(['next_run_at', 'is_active']); // Critical: scheduler scan index
    table.index(['queue_id']);
  });

  // ──────────────────────────────────────────────
  // DEAD LETTER QUEUE
  // ──────────────────────────────────────────────
  await knex.schema.createTable('dead_letter_queue', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('job_id').notNullable().references('id').inTable('jobs').onDelete('CASCADE');
    table.uuid('queue_id').notNullable().references('id').inTable('queues').onDelete('CASCADE');
    table.text('failure_reason').notNullable();
    table.integer('failure_count').notNullable().defaultTo(0);
    table.timestamp('last_failed_at', { useTz: true }).notNullable();
    table.jsonb('original_payload').notNullable();
    table.boolean('can_retry').notNullable().defaultTo(true);
    table.timestamp('retried_at', { useTz: true });
    table.uuid('retried_by').references('id').inTable('users').onDelete('SET NULL');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['queue_id']);
    table.index(['last_failed_at']);
    table.index(['can_retry']);
  });

  // ──────────────────────────────────────────────
  // REFRESH TOKENS (dedicated table for security)
  // ──────────────────────────────────────────────
  await knex.schema.createTable('refresh_tokens', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('token', 500).notNullable().unique();
    table.timestamp('expires_at', { useTz: true }).notNullable();
    table.boolean('is_revoked').notNullable().defaultTo(false);
    table.string('device_info', 255);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['user_id']);
    table.index(['token']);
  });

  // ──────────────────────────────────────────────
  // QUEUE METRICS SNAPSHOTS (for time-series charts)
  // ──────────────────────────────────────────────
  await knex.schema.createTable('queue_metrics', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('queue_id').notNullable().references('id').inTable('queues').onDelete('CASCADE');
    table.integer('pending_count').notNullable().defaultTo(0);
    table.integer('running_count').notNullable().defaultTo(0);
    table.integer('completed_count').notNullable().defaultTo(0);
    table.integer('failed_count').notNullable().defaultTo(0);
    table.float('avg_duration_ms');
    table.float('throughput_per_minute');
    table.float('error_rate');
    table.timestamp('captured_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['queue_id', 'captured_at']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('queue_metrics');
  await knex.schema.dropTableIfExists('refresh_tokens');
  await knex.schema.dropTableIfExists('dead_letter_queue');
  await knex.schema.dropTableIfExists('scheduled_jobs');
  await knex.schema.dropTableIfExists('worker_heartbeats');
  await knex.schema.dropTableIfExists('workers');
  await knex.schema.dropTableIfExists('job_logs');
  await knex.schema.dropTableIfExists('job_executions');
  await knex.schema.dropTableIfExists('jobs');
  await knex.schema.dropTableIfExists('job_batches');
  await knex.schema.dropTableIfExists('workflows');
  await knex.schema.dropTableIfExists('queues');
  await knex.schema.dropTableIfExists('retry_policies');
  await knex.schema.dropTableIfExists('projects');
  await knex.schema.dropTableIfExists('organization_members');
  await knex.schema.dropTableIfExists('organizations');
  await knex.schema.dropTableIfExists('users');

  await knex.raw('DROP TYPE IF EXISTS workflow_status CASCADE');
  await knex.raw('DROP TYPE IF EXISTS batch_status CASCADE');
  await knex.raw('DROP TYPE IF EXISTS log_level CASCADE');
  await knex.raw('DROP TYPE IF EXISTS retry_strategy CASCADE');
  await knex.raw('DROP TYPE IF EXISTS worker_status CASCADE');
  await knex.raw('DROP TYPE IF EXISTS execution_status CASCADE');
  await knex.raw('DROP TYPE IF EXISTS job_status CASCADE');
  await knex.raw('DROP TYPE IF EXISTS org_role CASCADE');
  await knex.raw('DROP TYPE IF EXISTS user_role CASCADE');
}
