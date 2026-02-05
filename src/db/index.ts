import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

import { config } from "../lib/config";

const pool = new Pool({ connectionString: config.db.url });

export const db = drizzle(pool);
export { pool };
