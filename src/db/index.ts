import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { Environment } from "../enums/environment.enum";
import { config } from "../lib/config";

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
