import Knex from 'knex';
import knexConfig from './knexfile';

// Singleton database connection
const db = Knex(knexConfig);

export { db };
export default db;
