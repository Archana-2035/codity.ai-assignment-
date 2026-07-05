import winston from 'winston';
import path from 'path';
import DailyRotateFile from 'winston-daily-rotate-file';

const { combine, timestamp, errors, json, colorize, printf, splat } = winston.format;

const devFormat = printf(({ level, message, timestamp: ts, stack, ...meta }) => {
  const metaStr = Object.keys(meta).length ? `\n${JSON.stringify(meta, null, 2)}` : '';
  return `${ts} [${level}]: ${stack || message}${metaStr}`;
});

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    errors({ stack: true }),
    splat(),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    json()
  ),
  defaultMeta: { service: 'djs-backend' },
  transports: [
    new DailyRotateFile({
      filename: path.join(process.cwd(), 'logs', 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxFiles: '14d',
      maxSize: '20m',
    }),
    new DailyRotateFile({
      filename: path.join(process.cwd(), 'logs', 'combined-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxFiles: '14d',
      maxSize: '20m',
    }),
  ],
});

logger.add(
  new winston.transports.Console({
    format: combine(colorize(), timestamp({ format: 'HH:mm:ss' }), devFormat),
  })
);

export { logger };
export default logger;
