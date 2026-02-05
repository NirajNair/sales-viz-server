import { sql } from "drizzle-orm";

import { db } from "../db";
import { config } from "../lib/config";
import { logger } from "../lib/logger";

const DEFAULT_TIMEOUT_MS = 1500;

async function checkDb(): Promise<"ok" | "down"> {
  try {
    const timeoutId = setTimeout(() => {
      logger.warn({ service: "db" }, "DB check timed out");
    }, DEFAULT_TIMEOUT_MS);

    await db.execute(sql`SELECT 1`);

    clearTimeout(timeoutId);
    logger.info({ service: "db" }, "DB is reachable");
    return "ok";
  } catch (error) {
    logger.warn({ service: "db", error }, "DB is unreachable");
    return "down";
  }
}

async function checkLlm(): Promise<"ok" | "down"> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    await fetch(config.llm.url, { method: "HEAD", signal: controller.signal });
    clearTimeout(timer);
    logger.info({ service: "llm" }, "LLM endpoint reachable");
    return "ok";
  } catch (error) {
    clearTimeout(timer);
    logger.warn({ service: "llm", error }, "LLM endpoint unreachable");
    return "down";
  }
}

export function handleHealth() {
  return { status: "ok" };
}

export async function handleReady() {
  const [db, llm] = await Promise.all([checkDb(), checkLlm()]);
  return { db, llm };
}
