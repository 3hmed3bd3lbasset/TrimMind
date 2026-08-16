import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runSeed() {
  const dbHost = process.env.DB_HOST || 'localhost';
  const dbPort = parseInt(process.env.DB_PORT || '3306', 10);
  const dbUser = process.env.DB_USER || 'root';
  const dbPassword = process.env.DB_PASSWORD || '';
  const dbName = process.env.DB_NAME || 'salon_db';

  console.log(`🌱 Initializing Database [${dbName}] at ${dbHost}:${dbPort}...`);

  // Initial connection without DB name to create DB if needed
  const rootConn = await mysql.createConnection({
    host: dbHost,
    port: dbPort,
    user: dbUser,
    password: dbPassword,
    multipleStatements: true,
  });

  await rootConn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
  await rootConn.end();

  // Connect to the specific DB
  const dbConn = await mysql.createConnection({
    host: dbHost,
    port: dbPort,
    user: dbUser,
    password: dbPassword,
    database: dbName,
    multipleStatements: true,
  });

  const schemaPath = path.resolve(__dirname, '../../../database/schema.sql');
  const seedPath = path.resolve(__dirname, '../../../database/seed.sql');

  if (fs.existsSync(schemaPath)) {
    console.log('📜 Executing schema.sql...');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    await dbConn.query(schemaSql);
  }

  if (fs.existsSync(seedPath)) {
    console.log('🌿 Executing seed.sql...');
    const seedSql = fs.readFileSync(seedPath, 'utf8');
    await dbConn.query(seedSql);
  }

  await dbConn.end();
  console.log('✅ Database initialization and seeding completed successfully!');
}

runSeed().catch((err) => {
  console.error('❌ Seeding failed:', err);
  process.exit(1);
});
