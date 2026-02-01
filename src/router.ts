import { Elysia } from "elysia";
import { handleHealth, handleReady } from "./handlers/health";
import { handleLogsExport } from "./handlers/logs";

export const router = new Elysia()
  .get("/health", handleHealth)
  .get("/ready", handleReady)
  .post("/api/logs/export", handleLogsExport);
