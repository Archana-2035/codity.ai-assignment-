import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });
import { logger } from './logger';
import { WorkerProcess } from './executor/worker';

async function main(): Promise<void> {
  logger.info('🔧 DJS Worker starting...');

  const worker = new WorkerProcess();
  await worker.start();
}

main().catch((err) => {
  logger.error('Worker failed to start', { error: err.message, stack: err.stack });
  process.exit(1);
});
// Trigger HMR restart
