interface Config {
  env: string;
  db: {
    url: string;
    host: string;
    port: number;
  };
  llm: {
    url: string;
  };
  server: {
    port: number;
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
  const env = process.env.NODE_ENV;
  if (!env || env.trim() === "") {
    throw new ConfigurationError("NODE_ENV is required but not set");
  }

  const dbHost = process.env.DB_HOST;
  if (!dbHost || dbHost.trim() === "") {
    throw new ConfigurationError("DB_HOST is required but not set");
  }

  const dbPortStr = process.env.DB_PORT;
  if (!dbPortStr || Number.isNaN(Number.parseInt(dbPortStr, 10))) {
    throw new ConfigurationError("DB_PORT must be a valid number");
  }
  const dbPort = Number.parseInt(dbPortStr, 10);

  const dbUrl = `postgresql://${dbHost}:${dbPort}`;

  const llmUrl = process.env.LLM_URL;
  if (!llmUrl || llmUrl.trim() === "") {
    throw new ConfigurationError("LLM_URL is required but not set");
  }

  const serverPortStr = process.env.PORT;
  if (!serverPortStr || Number.isNaN(Number.parseInt(serverPortStr, 10))) {
    throw new ConfigurationError("PORT must be a valid number");
  }
  const serverPort = Number.parseInt(serverPortStr, 10);

  const logDir = process.env.LOG_DIR;
  if (!logDir || logDir.trim() === "") {
    throw new ConfigurationError("LOG_DIR is required but not set");
  }

  const logLevel = process.env.LOG_LEVEL;
  if (!logLevel || logLevel.trim() === "") {
    throw new ConfigurationError("LOG_LEVEL is required but not set");
  }

  return {
    env,
    db: {
      url: dbUrl,
      host: dbHost,
      port: dbPort,
    },
    llm: {
      url: llmUrl,
    },
    server: {
      port: serverPort,
    },
    logs: {
      dir: logDir,
      level: logLevel,
    },
  };
}

// Initialize and validate config on module load
export const config = initConfig();

// Export for testing/debugging
export { ConfigurationError };
