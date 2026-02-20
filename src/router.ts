import { Elysia } from "elysia";
import { handleHealth, handleReady } from "./handlers/health";
import { handleGetMappings, handleLoadData } from "./handlers/load-data";
import { handleLogsExport } from "./handlers/logs";
import {
  handleGetNexusFilterOptions,
  handleGetNexusGraph,
} from "./handlers/nexus";
import {
  handleExportPurchaseRecords,
  handleGetPurchaseRecordFilterOptions,
  handleGetPurchaseRecords,
} from "./handlers/purchase-records";
import { handleGetUploads, handleRevertUpload } from "./handlers/upload";

export const router = new Elysia()
  .get("/health", handleHealth)
  .get("/ready", handleReady)
  .post("/api/logs/export", handleLogsExport)

  .post("/api/load-data/get-mappings", handleGetMappings)
  .post("/api/load-data", handleLoadData)

  .get("/api/purchase-records", handleGetPurchaseRecords)
  .get(
    "/api/purchase-records/filter-options",
    handleGetPurchaseRecordFilterOptions,
  )
  .get("/api/purchase-records/export", handleExportPurchaseRecords)

  .get("/api/uploads", handleGetUploads)
  .post("/api/uploads/:uploadId/revert", handleRevertUpload)

  .get("/api/nexus/graph", handleGetNexusGraph)
  .get("/api/nexus/filter-options", handleGetNexusFilterOptions);
