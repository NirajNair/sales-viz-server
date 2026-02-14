import type { Config } from "drizzle-kit";
import { Environment } from "./src/enums/environment.enum";
import { config } from "./src/lib/config";

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.name,
    ssl: config.env === Environment.Production,
  },
} satisfies Config;
