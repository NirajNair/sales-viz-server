import type { Config } from "drizzle-kit";
import { config } from "./src/lib/config";

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: config.db.url ?? "",
  },
} satisfies Config;
