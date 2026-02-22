import { cors } from "@elysiajs/cors";
import { Context, Elysia } from "elysia";
import { randomUUID } from "node:crypto";
import { checkDatabaseConnection } from "./db";
import { requestContext } from "./lib/async-context";
import { auth } from "./lib/auth";
import { config } from "./lib/config";
import { logger, loggerWithContext } from "./lib/logger";
import { router } from "./router";

const isDbConnected = await checkDatabaseConnection();
if (!isDbConnected) {
  logger.error("Cannot start server: Database connection failed");
  process.exit(1);
}

const betterAuthView = (context: Context) => {
  const BETTER_AUTH_ACCEPT_METHODS = ["POST", "GET"];
  // validate request method
  if (BETTER_AUTH_ACCEPT_METHODS.includes(context.request.method)) {
    return auth.handler(context.request);
  } else {
    return context.status(405, "Method Not Allowed");
  }
};

const app = new Elysia()
  .use(
    cors({
      origin: config.frontendBaseUrl,
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    }),
  )
  // Store requestId in Elysia store
  .onRequest(({ request, store }) => {
    const requestId = request.headers.get("x-request-id") || randomUUID();
    // @ts-ignore - store is mutable
    store.requestId = requestId;
    // @ts-ignore
    store.startTime = Date.now();
  })
  // Use derive to inject requestId into context and wrap in AsyncLocalStorage
  .derive(({ store }) => {
    const requestId = (store as { requestId: string }).requestId;
    return { requestId };
  })
  .onBeforeHandle(({ request, path, query, params, requestId }) => {
    // Set up AsyncLocalStorage context for this request
    requestContext.enterWith(requestId);

    const contentType = request.headers.get("content-type") || undefined;
    const contentLength = request.headers.get("content-length") || undefined;

    loggerWithContext.info(
      {
        method: request.method,
        path,
        query: query && Object.keys(query).length > 0 ? query : undefined,
        params: params && Object.keys(params).length > 0 ? params : undefined,
        contentType,
        contentLength,
        userAgent: request.headers.get("user-agent"),
        ip:
          request.headers.get("x-forwarded-for") ||
          request.headers.get("x-real-ip"),
      },
      "Request received",
    );
  })
  .onAfterResponse(({ request, store, path, set }) => {
    const startTime = (store as { startTime: number }).startTime;
    const durationMs = Date.now() - (startTime || Date.now());

    loggerWithContext.info(
      {
        method: request.method,
        path,
        status: set.status || 200,
        durationMs,
      },
      "Request completed",
    );
  })
  .onError(({ error, code, set, request, path, query, params, store }) => {
    const startTime = (store as { startTime: number }).startTime;
    const durationMs = Date.now() - (startTime || Date.now());

    const dbError = detectDatabaseError(error);
    if (dbError) {
      loggerWithContext.error(
        {
          err: error,
          method: request.method,
          path,
          query: query && Object.keys(query).length > 0 ? query : undefined,
          params: params && Object.keys(params).length > 0 ? params : undefined,
          durationMs,
          code,
          httpStatus: 503,
        },
        "Database Error",
      );
      set.status = 503;
      return {
        error: "Database unavailable. Please try again later.",
        statusCode: 503,
      };
    }

    // Check if it's an AppError with a statusCode property
    const httpStatusCode =
      error && typeof error === "object" && "statusCode" in error
        ? (error as { statusCode: number }).statusCode
        : getHttpStatusCode(code);

    loggerWithContext.error(
      {
        err: error,
        method: request.method,
        path,
        query: query && Object.keys(query).length > 0 ? query : undefined,
        params: params && Object.keys(params).length > 0 ? params : undefined,
        durationMs,
        code,
        httpStatus: httpStatusCode,
      },
      "Request failed",
    );
    set.status = httpStatusCode;
    return {
      error: error instanceof Error ? error.message : "Unknown error",
      statusCode: httpStatusCode,
    };
  })
  .all("/api/auth/*", betterAuthView)
  .use(router)
  .listen({ port: config.server.port }, ({ hostname, port }) => {
    logger.info(
      { host: hostname, port, env: config.env },
      `🦊 Elysia is running at ${hostname}:${port}`,
    );
  });

function getHttpStatusCode(code: string | number): number {
  switch (code) {
    case "INVALID_COOKIE_SIGNATURE":
      return 401;
    case "UNKNOWN":
    case "INTERNAL_SERVER_ERROR":
      return 500;
    case "PARSE":
    case "INVALID_FILE_TYPE":
    case "VALIDATION":
      return 400;
    case "NOT_FOUND":
      return 404;
    default:
      return typeof code === "number" ? code : 500;
  }
}

function detectDatabaseError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const err = error as Record<string, unknown>;
  const cause = err.cause as Record<string, unknown> | undefined;
  const underlying = cause && typeof cause === "object" ? cause : err;

  const code = (underlying.code ?? err.code) as string | undefined;
  const dbErrorCodes = ["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "ECONNRESET"];
  if (code && dbErrorCodes.includes(code)) return true;

  return false;
}
