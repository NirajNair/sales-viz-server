import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { unzipSync } from "fflate";

let handleLogsExport: typeof import("../src/handlers/logs").handleLogsExport;

let readdirImpl: (...args: any[]) => Promise<any>;
let readFileImpl: (...args: any[]) => Promise<any>;
let warnImpl: (...args: unknown[]) => void;
let infoImpl: (...args: unknown[]) => void;
let errorImpl: (...args: unknown[]) => void;
let originalEnv: NodeJS.ProcessEnv;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function decodeZipEntry(entry: Uint8Array | undefined) {
  if (!entry) return "";
  return decoder.decode(entry);
}

beforeAll(async () => {
  originalEnv = { ...process.env };
  process.env.NODE_ENV = "test";
  process.env.DB_HOST = "127.0.0.1";
  process.env.DB_PORT = "5432";
  process.env.LLM_URL = "http://localhost:99999/unreachable";
  process.env.PORT = "3000";
  process.env.LOG_LEVEL = "info";
  process.env.LOG_DIR = "logs";

  readdirImpl = mock(async () => []);
  readFileImpl = mock(async () => Buffer.from(encoder.encode("")));
  warnImpl = mock(() => {});
  infoImpl = mock(() => {});
  errorImpl = mock(() => {});

  mock.module("node:fs/promises", () => ({
    readdir: (...args: Parameters<typeof readdirImpl>) => readdirImpl(...args),
    readFile: (...args: Parameters<typeof readFileImpl>) => readFileImpl(...args),
  }));

  const mockLogger = {
    info: (...args: unknown[]) => infoImpl(...args),
    warn: (...args: unknown[]) => warnImpl(...args),
    error: (...args: unknown[]) => errorImpl(...args),
  };
  
  mock.module("../src/lib/logger", () => ({
    logger: mockLogger,
    loggerWithContext: mockLogger,
  }));

  ({ handleLogsExport } = await import("../src/handlers/logs"));
});

afterAll(() => {
  process.env = originalEnv;
  mock.restore();
});

describe("handleLogsExport", () => {
  test("returns zip with ndjson files and logs.txt", async () => {
    const logLine = JSON.stringify({
      level: 30,
      time: "2026-02-01T12:00:00.000Z",
      msg: "hello world",
      requestId: "req-1",
    });
    const rawLine = "not-json-line";
    const logContent = `${logLine}\n${rawLine}\n`;

    readdirImpl = mock(async () => [
      {
        name: "app.ndjson",
        isFile: () => true,
      },
    ]);
    readFileImpl = mock(async () => Buffer.from(encoder.encode(logContent)));

    const response = await handleLogsExport();
    expect(response.headers.get("Content-Type")).toBe("application/zip");
    expect(response.headers.get("Content-Disposition")).toContain(
      "logs-export.zip",
    );

    const zipBuffer = new Uint8Array(await response.arrayBuffer());
    const zipEntries = unzipSync(zipBuffer);

    expect(zipEntries["app.ndjson"]).toBeDefined();
    expect(zipEntries["logs.txt"]).toBeDefined();

    const logsText = decodeZipEntry(zipEntries["logs.txt"]);
    expect(logsText).toContain("== app.ndjson ==");
    expect(logsText).toContain("hello world");
    expect(logsText).toContain("not-json-line");
  });

  test("throws error when log dir fails", async () => {
    readdirImpl = mock(async () => {
      throw new Error("no access");
    });

    await expect(handleLogsExport()).rejects.toThrow("no access");
  });
});
