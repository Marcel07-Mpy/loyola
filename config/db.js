/**
 * Pool PostgreSQL partagé. DATABASE_URL est privilégiée en hébergement ;
 * les variables DB_* restent compatibles avec le développement local.
 */
import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const useConnectionString = Boolean(process.env.DATABASE_URL);
const sslEnabled = process.env.DB_SSL === 'true' || (useConnectionString && process.env.DB_SSL !== 'false');

const pool = new Pool(useConnectionString
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: sslEnabled ? { rejectUnauthorized: false } : false,
      client_encoding: 'utf8',
    }
  : {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      ssl: sslEnabled ? { rejectUnauthorized: false } : false,
      client_encoding: 'utf8',
    });

export default pool;
