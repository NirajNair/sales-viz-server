import { join } from "node:path";
import pino from "pino";
import { config } from "./config";

const isDevelopment = config.env === "development";
const isTest = config.env === "test";
const logDir = join(process.cwd(), config.logs.dir);

function createFileTargets() {
  return [
    // Main application logs with rotation (NDJSON)
    {
      target: "pino-roll",
      level: "info",
      options: {
        file: join(logDir, "app.ndjson"),
        frequency: "daily",
        size: "100m",
        dateFormat: "yyyy-MM-dd",
        mkdir: true,
        symlink: true,
        limit: {
          count: 30, // Keep 30 days of logs
          removeOtherLogFiles: true,
        },
        sync: false, // Async writes for performance
      },
    },
    // Separate error-only logs (NDJSON)
    {
      target: "pino-roll",
      level: "error",
      options: {
        file: join(logDir, "error.ndjson"),
        frequency: "daily",
        size: "50m",
        dateFormat: "yyyy-MM-dd",
        mkdir: true,
        symlink: true,
        limit: {
          count: 30, // Keep 30 days of logs
          removeOtherLogFiles: true,
        },
        sync: false,
      },
    },
  ];
}

// Create transport configuration
function createTransport() {
  const fileTargets = createFileTargets();

  // Development: pretty printing to console + file logs
  if (isDevelopment) {
    return {
      targets: [
        {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
            ignore: "pid,hostname",
            singleLine: false,
          },
        },
        ...fileTargets,
      ],
    };
  }

  // Production: rotating file logs with multi-stream
  return {
    targets: fileTargets,
  };
}

const destination = isTest
  ? pino.destination({ fd: 1, sync: true })
  : pino.transport(createTransport() as any);

// Create base logger
export const logger = pino(
  {
    level: config.logs.level || (isDevelopment ? "debug" : "info"),
    name: "purchase-viz-server",
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
