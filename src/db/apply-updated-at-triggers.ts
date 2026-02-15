import { readFile } from "node:fs/promises";

import { Client } from "pg";

import { Environment } from "../enums/environment.enum";
import { config } from "../lib/config";

async function applyTriggers() {
  const sqlPath = new URL("./updated_at_triggers.sql", import.meta.url);
  const sql = await readFile(sqlPath, "utf8");

  const client = new Client({
    user: config.db.user,
    password: config.db.password,
    host: config.db.host,
    port: config.db.port,
    database: config.db.name,
    ssl: config.env === Environment.Production,
  });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

await applyTriggers();
