import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import pino from "pino";
import { Environment } from "../enums/environment.enum";
import { getRequestId } from "./async-context";
import { config } from "./config";

const isDevelopment = config.env === Environment.Development;
const isTest = config.env === Environment.Test;
const logDir = join(process.cwd(), config.logs.dir);

// Ensure log directory exists
if (!isTest && !existsSync(logDir)) {
  mkdirSync(logDir, { recursive: true });
}

let destination: pino.DestinationStream;

if (isTest) {
  // Test: simple stdout
  destination = pino.destination({ fd: 1, sync: true });
} else if (isDevelopment) {
  // Development: pretty console output only (no file logging to avoid pino-roll issues)
  destination = pino.transport({
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "SYS:standard",
      ignore: "pid,hostname",
      singleLine: false,
    },
  });
} else {
  // Production: simple file output without rotation (use external log rotation like logrotate)
  destination = pino.destination({
    dest: join(logDir, "app.log"),
    sync: false,
    mkdir: true,
  });
}

// Create base logger
export const logger = pino(
  {
    level: config.logs.level || (isDevelopment ? "debug" : "info"),
    name: "sales-viz-server",
    formatters: {
      level: (label) => ({ level: label }),
    },
    serializers: {
      err: pino.stdSerializers.err,
      error: pino.stdSerializers.err,
      req: pino.stdSerializers.req,
      res: pino.stdSerializers.res,
    },
    base: {
      env: config.env,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  destination,
);

// Request logger helper - creates child logger with request context
export function createRequestLogger(
  requestId: string,
  context?: Record<string, unknown>,
) {
  return logger.child({
    requestId,
    ...context,
  });
}

// Graceful shutdown
process.on("SIGTERM", () => {
  logger.info("Received SIGTERM, flushing logs");
  logger.flush();
  setTimeout(() => process.exit(0), 500);
});

process.on("SIGINT", () => {
  logger.info("Received SIGINT, flushing logs");
  logger.flush();
  setTimeout(() => process.exit(0), 500);
});

// Handle uncaught errors
process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "Uncaught exception");
  logger.flush();
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  logger.fatal({ reason, promise }, "Unhandled promise rejection");
  logger.flush();
  process.exit(1);
});

/**
 * Smart global logger that automatically attaches request context.
 * Use this logger anywhere in your code - if it's called within a request context,
 * the requestId will be automatically added to all log entries.
 * If called outside a request context, it behaves like the base logger.
 */
const logMethods = [
  "info",
  "error",
  "warn",
  "debug",
  "trace",
  "fatal",
] as const;
type LogMethod = (typeof logMethods)[number];

function isLogMethod(prop: PropertyKey): prop is LogMethod {
  return typeof prop === "string" && logMethods.includes(prop as LogMethod);
}

export const loggerWithContext = new Proxy(logger, {
  get(target, prop) {
    const value = target[prop as keyof typeof target];

    // Only proxy log methods (info, error, warn, debug, trace, fatal)
    if (isLogMethod(prop) && typeof value === "function") {
      return (...args: unknown[]) => {
        const requestId = getRequestId();
        const logFn = target[prop] as pino.LogFn;
        if (requestId) {
          // Create a child logger with request context for this specific call
          return logFn.apply(target.child({ requestId }), args as [never]);
        }
        // No request context, use base logger
        return logFn.apply(target, args as [never]);
      };
    }

    // Return other properties as-is
    return value;
  },
});
