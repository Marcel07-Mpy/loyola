/**
 * Pool PostgreSQL partagé.
 * Accepte les noms de variables courants de Vercel/Neon.
 */
import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const connectionString =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.NEON_DATABASE_URL ||
  process.env.NEON_URL ||
  process.env.DATABASE_URL_UNPOOLED ||
  null;

const useConnectionString = Boolean(connectionString);
const sslEnabled =
  process.env.DB_SSL === 'true' ||
  (useConnectionString && process.env.DB_SSL !== 'false');

const pool = new Pool(useConnectionString
  ? {
      connectionString,
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
