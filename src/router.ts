import { Elysia } from "elysia";
import { handleHealth, handleReady } from "./handlers/health";
import { handleGetMappings, handleLoadData } from "./handlers/load-data";
import { handleLogsExport } from "./handlers/logs";

export const router = new Elysia()
  .get("/health", handleHealth)
  .get("/ready", handleReady)
  .post("/api/load-data/get-mappings", handleGetMappings)
  .post("/api/load-data", handleLoadData)
  .post("/api/logs/export", handleLogsExport);
