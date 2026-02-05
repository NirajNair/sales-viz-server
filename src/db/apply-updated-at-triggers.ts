import { readFile } from "node:fs/promises";

import { Client } from "pg";

import { config } from "../lib/config";

async function applyTriggers() {
  const sqlPath = new URL("./updated_at_triggers.sql", import.meta.url);
  const sql = await readFile(sqlPath, "utf8");

  const client = new Client({ connectionString: config.db.url });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

await applyTriggers();
