import { Elysia } from "elysia";
import { handleHealth, handleReady } from "./handlers/health";
import { handleLogsExport } from "./handlers/logs";
import { handleUpload } from "./handlers/upload";

export const router = new Elysia()
  .get("/health", handleHealth)
  .get("/ready", handleReady)
  .post("/api/upload", handleUpload)
  .post("/api/logs/export", handleLogsExport);
