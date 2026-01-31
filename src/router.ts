import { Elysia } from "elysia";
import { handleHealth, handleReady } from "./handlers/health";

export const router = new Elysia()
  .get("/health", handleHealth)
  .get("/ready", handleReady);
