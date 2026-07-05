import dotenv from 'dotenv';
import type { Knex } from 'knex';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const config: Knex.Config = {
  client: 'pg',
  connection: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'job_scheduler',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  },
  pool: {
    min: 2,
    max: 10,
    acquireTimeoutMillis: 30000,
    createTimeoutMillis: 30000,
    idleTimeoutMillis: 30000,
  },
  migrations: {
    directory: path.join(__dirname, 'migrations'),
    extension: 'ts',
    tableName: 'knex_migrations',
  },
  seeds: {
    directory: path.join(__dirname, 'seeds'),
    extension: 'ts',
  },
};

export default config;
