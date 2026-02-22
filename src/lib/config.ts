import { homedir } from "node:os";
import { join } from "node:path";
import { Environment } from "../enums/environment.enum";

interface Config {
  env: string;
  frontendBaseUrl: string;
  db: {
    url: string;
    user: string;
    password: string;
    host: string;
    port: number;
    name: string;
  };
  llm: {
    url: string;
  };
  server: {
    port: number;
  };
  betterAuth: {
    secret: string;
    url: string;
  };
  logs: {
    dir: string;
    level: string;
  };
}

class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}

function initConfig(): Config {
  try {
    const env = process.env.NODE_ENV;
    if (!env || env.trim() === "") {
      throw new ConfigurationError("NODE_ENV is required but not set");
    }

    const frontendBaseUrl = process.env.FRONTEND_BASE_URL;
    if (!frontendBaseUrl || frontendBaseUrl.trim() === "") {
      throw new ConfigurationError("FRONTEND_BASE_URL is required but not set");
    }

    const dbHost = process.env.DB_HOST;
    if (!dbHost || dbHost.trim() === "") {
      throw new ConfigurationError("DB_HOST is required but not set");
    }

    const dbUser = process.env.DB_USER;
    if (!dbUser || dbUser.trim() === "") {
      throw new ConfigurationError("DB_USER is required but not set");
    }

    const dbPassword = process.env.DB_PASSWORD;
    if (!dbPassword || dbPassword.trim() === "") {
      throw new ConfigurationError("DB_PASSWORD is required but not set");
    }

    const dbName = process.env.DB_NAME;
    if (!dbName || dbName.trim() === "") {
      throw new ConfigurationError("DB_NAME is required but not set");
    }

    const dbPortStr = process.env.DB_PORT;
    if (!dbPortStr || Number.isNaN(Number.parseInt(dbPortStr, 10))) {
      throw new ConfigurationError("DB_PORT must be a valid number");
    }
    const dbPort = Number.parseInt(dbPortStr, 10);

    // const dbUrl = `postgresql://${dbHost}:${dbPort}`;
    const dbUrl = `postgresql://${dbUser}:${encodeURIComponent(dbPassword)}@${dbHost}:${dbPort}/${dbName}`;

    const llmUrl = process.env.LLM_URL;
    if (!llmUrl || llmUrl.trim() === "") {
      throw new ConfigurationError("LLM_URL is required but not set");
    }

    const serverPortStr = process.env.PORT;
    if (!serverPortStr || Number.isNaN(Number.parseInt(serverPortStr, 10))) {
      throw new ConfigurationError("PORT must be a valid number");
    }
    const serverPort = Number.parseInt(serverPortStr, 10);

    const betterAuthSecret = process.env.BETTER_AUTH_SECRET;
    if (!betterAuthSecret || betterAuthSecret.trim() === "") {
      throw new ConfigurationError(
        "BETTER_AUTH_SECRET is required but not set",
      );
    }

    const betterAuthUrl = process.env.BETTER_AUTH_URL;
    if (!betterAuthUrl || betterAuthUrl.trim() === "") {
      throw new ConfigurationError("BETTER_AUTH_URL is required but not set");
    }

    const logDir =
      process.env.LOG_DIR && process.env.LOG_DIR.trim() !== ""
        ? process.env.LOG_DIR
        : join(homedir(), "PurchaseData", "logs");

    const logLevel = process.env.LOG_LEVEL;
    if (!logLevel || logLevel.trim() === "") {
      throw new ConfigurationError("LOG_LEVEL is required but not set");
    }

    return {
      env,
      frontendBaseUrl,
      db: {
        url: dbUrl,
        user: dbUser,
        password: dbPassword,
        host: dbHost,
        port: dbPort,
        name: dbName,
      },
      llm: {
        url: llmUrl,
      },
      server: {
        port: serverPort,
      },
      betterAuth: {
        secret: betterAuthSecret,
        url: betterAuthUrl,
      },
      logs: {
        dir: logDir,
        level: env === Environment.Development ? "debug" : "info",
      },
    };
  } catch (error) {
    throw new ConfigurationError(
      `Failed to initialize configuration: ${error}`,
    );
  }
}

// Initialize and validate config on module load
export const config = initConfig();

// Export for testing/debugging
export { ConfigurationError };
