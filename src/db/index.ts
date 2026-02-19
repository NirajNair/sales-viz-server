import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { Environment } from "../enums/environment.enum";
import { config } from "../lib/config";
import { logger } from "../lib/logger";

const pool = new Pool({
  user: config.db.user,
  password: config.db.password,
  host: config.db.host,
  port: config.db.port,
  database: config.db.name,
  ssl: config.env === Environment.Production,
});

export const db = drizzle(pool);
export { pool };

export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await db.execute(sql`SELECT 1`);
    logger.info("Database connection verified successfully");
    return true;
  } catch (error) {
    logger.error(
      {
        error,
        host: config.db.host,
        port: config.db.port,
        database: config.db.name,
      },
      "Failed to connect to database",
    );
    return false;
  }
}
