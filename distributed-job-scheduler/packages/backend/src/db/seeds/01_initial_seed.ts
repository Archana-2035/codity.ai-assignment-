import type { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';

export async function seed(knex: Knex): Promise<void> {
  // Clean existing data
  await knex('dead_letter_queue').delete();
  await knex('job_logs').delete();
  await knex('job_executions').delete();
  await knex('worker_heartbeats').delete();
  await knex('workers').delete();
  await knex('scheduled_jobs').delete();
  await knex('jobs').delete();
  await knex('job_batches').delete();
  await knex('queues').delete();
  await knex('retry_policies').delete();
  await knex('projects').delete();
  await knex('organization_members').delete();
  await knex('organizations').delete();
  await knex('refresh_tokens').delete();
  await knex('users').delete();

  // Create admin user
  const adminId = uuidv4();
  const adminHash = await bcrypt.hash('Admin@1234', 12);
  await knex('users').insert({
    id: adminId,
    email: 'admin@djs.dev',
    password_hash: adminHash,
    role: 'admin',
  });

  // Create member user
  const memberId = uuidv4();
  const memberHash = await bcrypt.hash('Member@1234', 12);
  await knex('users').insert({
    id: memberId,
    email: 'member@djs.dev',
    password_hash: memberHash,
    role: 'member',
  });

  // Create organization
  const orgId = uuidv4();
  await knex('organizations').insert({
    id: orgId,
    name: 'Demo Organization',
    slug: 'demo-org',
    description: 'Demo organization for the distributed job scheduler',
  });

  // Add members
  await knex('organization_members').insert([
    { org_id: orgId, user_id: adminId, role: 'owner' },
    { org_id: orgId, user_id: memberId, role: 'member' },
  ]);

  // Create retry policies
  const retryPolicyId1 = uuidv4();
  const retryPolicyId2 = uuidv4();
  const retryPolicyId3 = uuidv4();
  await knex('retry_policies').insert([
    {
      id: retryPolicyId1,
      name: 'Fast Retry (Fixed)',
      strategy: 'fixed',
      max_attempts: 3,
      initial_delay_ms: 1000,
      max_delay_ms: 5000,
      multiplier: 1,
      jitter: false,
    },
    {
      id: retryPolicyId2,
      name: 'Standard Retry (Exponential)',
      strategy: 'exponential',
      max_attempts: 5,
      initial_delay_ms: 1000,
      max_delay_ms: 300000,
      multiplier: 2.0,
      jitter: true,
    },
    {
      id: retryPolicyId3,
      name: 'Aggressive Retry (Linear)',
      strategy: 'linear',
      max_attempts: 10,
      initial_delay_ms: 500,
      max_delay_ms: 60000,
      multiplier: 1,
      jitter: true,
    },
  ]);

  // Create project
  const projectId = uuidv4();
  const apiKey = `sk_demo_${uuidv4().replace(/-/g, '').slice(0, 32)}`;
  await knex('projects').insert({
    id: projectId,
    org_id: orgId,
    name: 'Demo Project',
    slug: 'demo-project',
    description: 'Demo project showcasing all job scheduler features',
    api_key: apiKey,
  });

  // Create queues
  const emailQueueId = uuidv4();
  const dataQueueId = uuidv4();
  const highPriorityQueueId = uuidv4();
  await knex('queues').insert([
    {
      id: emailQueueId,
      project_id: projectId,
      name: 'email-delivery',
      description: 'Email sending and notification queue',
      priority: 2,
      concurrency_limit: 20,
      retry_policy_id: retryPolicyId2,
      rate_limit_per_minute: 100,
      dlq_enabled: true,
    },
    {
      id: dataQueueId,
      project_id: projectId,
      name: 'data-processing',
      description: 'Batch data processing and ETL jobs',
      priority: 5,
      concurrency_limit: 5,
      retry_policy_id: retryPolicyId1,
      dlq_enabled: true,
    },
    {
      id: highPriorityQueueId,
      project_id: projectId,
      name: 'critical-alerts',
      description: 'High-priority critical system alerts',
      priority: 1,
      concurrency_limit: 50,
      retry_policy_id: retryPolicyId3,
      dlq_enabled: true,
    },
  ]);

  // Create sample scheduled jobs
  const now = new Date();
  const in5Min = new Date(now.getTime() + 5 * 60 * 1000);
  await knex('scheduled_jobs').insert([
    {
      id: uuidv4(),
      queue_id: dataQueueId,
      name: 'Daily Cleanup',
      type: 'cleanup-database',
      payload: JSON.stringify({ tableName: 'job_logs', olderThanDays: 30 }),
      cron_expression: '0 2 * * *',
      next_run_at: in5Min,
      timezone: 'UTC',
      is_active: true,
      created_by: adminId,
    },
    {
      id: uuidv4(),
      queue_id: emailQueueId,
      name: 'Weekly Digest Email',
      type: 'send-email',
      payload: JSON.stringify({ to: 'team@example.com', subject: 'Weekly Digest' }),
      cron_expression: '0 9 * * 1',
      next_run_at: in5Min,
      timezone: 'UTC',
      is_active: true,
      created_by: adminId,
    },
  ]);

  // Create sample jobs in various states
  const statuses = ['pending', 'completed', 'failed', 'dead'];
  for (let i = 0; i < 30; i++) {
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    const queueId = [emailQueueId, dataQueueId, highPriorityQueueId][Math.floor(Math.random() * 3)];
    const jobId = uuidv4();
    const jobType = ['send-email', 'process-data', 'generate-report', 'deliver-webhook'][Math.floor(Math.random() * 4)];

    await knex('jobs').insert({
      id: jobId,
      queue_id: queueId,
      project_id: projectId,
      type: jobType,
      payload: JSON.stringify({ demo: true, index: i }),
      priority: Math.floor(Math.random() * 5) + 1,
      status,
      run_at: new Date(now.getTime() - Math.random() * 3600000),
      attempt_count: status === 'dead' ? 3 : (status === 'failed' ? 2 : Math.floor(Math.random() * 2)),
      max_attempts: 3,
      started_at: ['completed', 'failed', 'dead'].includes(status) ? new Date(now.getTime() - 120000) : null,
      completed_at: status === 'completed' ? new Date(now.getTime() - 60000) : null,
      failure_reason: ['failed', 'dead'].includes(status) ? 'Simulated demo failure' : null,
      created_by: adminId,
    });
  }

  console.log(`
✅ Seed complete!

📧 Admin: admin@djs.dev / Admin@1234
👤 Member: member@djs.dev / Member@1234
🔑 API Key: ${apiKey}
🏢 Org: demo-org
📁 Project: demo-project

Queues created:
  - email-delivery (${emailQueueId})
  - data-processing (${dataQueueId})
  - critical-alerts (${highPriorityQueueId})
  `);
}
