import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const dbUrl = process.env.MYSQL_URL || process.env.DATABASE_URL || process.env.MYSQL_PUBLIC_URL;
const dbHost = process.env.DB_HOST || process.env.MYSQLHOST || process.env.MYSQL_HOST || 'localhost';
const dbPort = parseInt(process.env.DB_PORT || process.env.MYSQLPORT || process.env.MYSQL_PORT || '3306', 10);
const dbUser = process.env.DB_USER || process.env.MYSQLUSER || process.env.MYSQL_USER || 'root';
const dbPassword = process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || process.env.MYSQL_PASSWORD || '';
const dbName = process.env.DB_NAME || process.env.MYSQLDATABASE || process.env.MYSQL_DATABASE || 'salon_db';

export const pool = dbUrl
  ? mysql.createPool({
      uri: dbUrl,
      waitForConnections: true,
      connectionLimit: 15,
      maxIdle: 10,
      idleTimeout: 60000,
      enableKeepAlive: true,
    })
  : mysql.createPool({
      host: dbHost,
      port: dbPort,
      user: dbUser,
      password: dbPassword,
      database: dbName,
      waitForConnections: true,
      connectionLimit: 15,
      maxIdle: 10,
      idleTimeout: 60000,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
      charset: 'utf8mb4',
    });

// Helper for parameterized queries preventing SQL injection and mysql2 prepared statement AggregateError
export async function query<T = any>(sql: string, params: any[] = []): Promise<T> {
  const sanitizedParams = params.map((p) => (p === undefined ? null : p));
  if (sanitizedParams.length === 0) {
    const [results] = await pool.query(sql);
    return results as T;
  }
  const [results] = await pool.query(sql, sanitizedParams);
  return results as T;
}

// Helper for queries within a dedicated connection / transaction
export async function queryConn<T = any>(conn: mysql.PoolConnection, sql: string, params: any[] = []): Promise<T> {
  const sanitizedParams = params.map((p) => (p === undefined ? null : p));
  if (sanitizedParams.length === 0) {
    const [results] = await conn.query(sql);
    return results as T;
  }
  const [results] = await conn.query(sql, sanitizedParams);
  return results as T;
}

// Managed transaction helper ensuring BEGIN, COMMIT, and ROLLBACK
export async function withTransaction<T>(callback: (conn: mysql.PoolConnection) => Promise<T>): Promise<T> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await callback(conn);
    await conn.commit();
    return result;
  } catch (error) {
    try {
      await conn.rollback();
    } catch (rbErr) {
      console.error('[DB Transaction Rollback Error]:', rbErr);
    }
    throw error;
  } finally {
    conn.release();
  }
}

// Database connectivity check
export async function testDbConnection(): Promise<boolean> {
  try {
    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();
    console.log('✅ Connected successfully to MySQL Database (' + dbName + ')');
    return true;
  } catch (error: any) {
    console.warn('⚠️ Warning: MySQL database connection failed:', error.message);
    console.warn('💡 If MySQL is not running yet, the server will continue and retry.');
    return false;
  }
}

