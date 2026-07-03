import { JobContext, JobHandler, LogLevel } from '@djs/shared';

// ─── Demo Job Handlers ────────────────────────────────────────
// These demonstrate the handler pattern. In production, replace with real business logic.

const handlers: Record<string, JobHandler> = {
  // ─── Email Handler ────────────────────────────────────────
  'send-email': async (ctx: JobContext) => {
    await ctx.log(LogLevel.INFO, 'Preparing email', { recipient: ctx.payload.to });
    
    // Simulate email sending delay
    await sleep(Math.random() * 500 + 100);
    
    if (ctx.payload.fail) {
      throw new Error('Email delivery failed: SMTP server unreachable');
    }

    await ctx.log(LogLevel.INFO, 'Email sent successfully', {
      recipient: ctx.payload.to,
      subject: ctx.payload.subject,
    });

    return { messageId: `msg_${Date.now()}`, sentAt: new Date().toISOString() };
  },

  // ─── Data Processing Handler ──────────────────────────────
  'process-data': async (ctx: JobContext) => {
    const { records = 100 } = ctx.payload as { records: number };
    await ctx.log(LogLevel.INFO, `Processing ${records} records`);
    
    // Simulate batched processing
    const batchSize = 10;
    let processed = 0;
    
    for (let i = 0; i < records; i += batchSize) {
      await sleep(50);
      processed = Math.min(i + batchSize, records as number);
      await ctx.log(LogLevel.DEBUG, `Progress: ${processed}/${records}`);
    }

    return { recordsProcessed: processed, completedAt: new Date().toISOString() };
  },

  // ─── Report Generation ────────────────────────────────────
  'generate-report': async (ctx: JobContext) => {
    await ctx.log(LogLevel.INFO, 'Starting report generation', { type: ctx.payload.reportType });
    await sleep(Math.random() * 2000 + 500);
    
    const reportId = `report_${Date.now()}`;
    await ctx.log(LogLevel.INFO, 'Report generated', { reportId });
    
    return { reportId, url: `https://reports.example.com/${reportId}` };
  },

  // ─── Webhook Delivery ─────────────────────────────────────
  'deliver-webhook': async (ctx: JobContext) => {
    const { url, payload: webhookPayload, secret } = ctx.payload as any;
    await ctx.log(LogLevel.INFO, 'Delivering webhook', { url });

    // Simulate webhook HTTP call
    await sleep(Math.random() * 300 + 50);
    
    if (Math.random() < 0.05) { // 5% failure rate for testing
      throw new Error(`Webhook delivery failed: HTTP 503 from ${url}`);
    }

    return { delivered: true, statusCode: 200, deliveredAt: new Date().toISOString() };
  },

  // ─── Database Cleanup ─────────────────────────────────────
  'cleanup-database': async (ctx: JobContext) => {
    const { tableName, olderThanDays = 30 } = ctx.payload as any;
    await ctx.log(LogLevel.INFO, `Cleaning up ${tableName} records older than ${olderThanDays} days`);
    await sleep(Math.random() * 1000 + 200);
    
    const deletedCount = Math.floor(Math.random() * 1000);
    await ctx.log(LogLevel.INFO, `Cleanup complete`, { deletedCount });
    
    return { deletedCount, tableName, cleanedAt: new Date().toISOString() };
  },

  // ─── Image Processing ─────────────────────────────────────
  'process-image': async (ctx: JobContext) => {
    const { imageUrl, operations } = ctx.payload as any;
    await ctx.log(LogLevel.INFO, 'Processing image', { imageUrl, operations });
    await sleep(Math.random() * 1500 + 500);
    
    return {
      original: imageUrl,
      processed: `${imageUrl}?w=800&q=80`,
      operations,
      completedAt: new Date().toISOString(),
    };
  },

  // ─── Default/Fallback Handler ─────────────────────────────
  'default': async (ctx: JobContext) => {
    await ctx.log(LogLevel.INFO, `Executing job type: ${ctx.type}`);
    await sleep(Math.random() * 200 + 50);
    return { executed: true, type: ctx.type };
  },
};

// ─── Handler Registry ─────────────────────────────────────────

export function getHandler(jobType: string): JobHandler {
  return handlers[jobType] || handlers['default'];
}

export function registerHandler(jobType: string, handler: JobHandler): void {
  handlers[jobType] = handler;
}

// ─── Utility ─────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
