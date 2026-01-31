import { Elysia } from "elysia";
import { randomUUID } from "node:crypto";
import { config } from "./lib/config";
import { logger, createRequestLogger } from "./lib/logger";
import { router } from "./router";

const app = new Elysia()
  .onRequest(({ request, store }) => {
    const requestId = request.headers.get("x-request-id") || randomUUID();

    // @ts-ignore - store is mutable
    store.requestId = requestId;
    // @ts-ignore
    store.startTime = Date.now();

    // Create request-scoped logger
    // @ts-ignore
    store.logger = createRequestLogger(requestId);
  })
  .onBeforeHandle(({ request, store, path, query, params, body }) => {
    // @ts-ignore
    const reqLogger = store.logger;

    reqLogger.info(
      {
        method: request.method,
        path,
        query: query && Object.keys(query).length > 0 ? query : undefined,
        params: params && Object.keys(params).length > 0 ? params : undefined,
        body: body || undefined,
        userAgent: request.headers.get("user-agent"),
        ip:
          request.headers.get("x-forwarded-for") ||
          request.headers.get("x-real-ip"),
      },
      "Request received",
    );
  })
  .onAfterResponse(({ request, store, path, set }) => {
    // @ts-ignore
    const reqLogger = store.logger;
    // @ts-ignore
    const duration = Date.now() - (store.startTime || Date.now());

    reqLogger.info(
      {
        method: request.method,
        path,
        status: set.status || 200,
        duration,
      },
      "Request completed",
    );
  })
  .onError(
    ({ error, code, set, request, path, query, params, body, store }) => {
      // @ts-ignore
      const reqLogger = store.logger || logger;
      // @ts-ignore
      const duration = Date.now() - (store.startTime || Date.now());
      const httpStatusCode = getHttpStatusCode(code);

      reqLogger.error(
        {
          err: error,
          method: request.method,
          path,
          query: query && Object.keys(query).length > 0 ? query : undefined,
          params: params && Object.keys(params).length > 0 ? params : undefined,
          body: body || undefined,
          duration,
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
    },
  )
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
