import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";

let handleHealth: typeof import("../src/handlers/health").handleHealth;
let handleReady: typeof import("../src/handlers/health").handleReady;
let originalEnv: NodeJS.ProcessEnv;
let baseEnv: NodeJS.ProcessEnv;

type DbBehavior = {
  connect: () => Promise<void>;
  query: () => Promise<void>;
  end: () => Promise<void>;
};

let dbBehavior: DbBehavior = {
  connect: async () => {},
  query: async () => {},
  end: async () => {},
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

beforeAll(async () => {
  originalEnv = { ...process.env };

  process.env.NODE_ENV = "test";
  process.env.DB_HOST = "127.0.0.1";
  process.env.DB_PORT = "5432";
  process.env.LLM_URL = "http://localhost:99999/unreachable";
  process.env.PORT = "3000";
  process.env.LOG_DIR = "/tmp";

  baseEnv = { ...process.env };

  mock.module("pg", () => ({
    Client: class {
      connect() {
        return dbBehavior.connect();
      }
      query() {
        return dbBehavior.query();
      }
      end() {
        return dbBehavior.end();
      }
    },
  }));

  ({ handleHealth, handleReady } = await import("../src/handlers/health"));
});

afterAll(() => {
  process.env = originalEnv;
  mock.restore();
});

describe("Health Handlers", () => {
  describe("handleHealth", () => {
    test("should return status ok", () => {
      const result = handleHealth();
      expect(result).toEqual({ status: "ok" });
    });

    test("should always return the same structure", () => {
      const result1 = handleHealth();
      const result2 = handleHealth();
      expect(result1).toEqual(result2);
    });
  });

  describe("handleReady", () => {
    beforeEach(() => {
      process.env = { ...baseEnv };
      dbBehavior = {
        connect: async () => {},
        query: async () => {},
        end: async () => {},
      };
      globalThis.fetch = mock(async () => ({
        ok: true,
      })) as unknown as typeof fetch;
    });

    test("should return both db and llm status", async () => {
      const result = await handleReady();

      expect(result).toHaveProperty("db");
      expect(result).toHaveProperty("llm");
      expect(result.db).toBe("ok");
      expect(result.llm).toBe("ok");
    });

    test("should return down for llm when LLM_URL is unreachable", async () => {
      globalThis.fetch = mock(async () => {
        throw new Error("unreachable");
      }) as unknown as typeof fetch;

      const result = await handleReady();

      expect(result.llm).toBe("down");
    });

    test("should complete within reasonable timeout", async () => {
      dbBehavior.connect = async () => {
        await delay(50);
      };
      globalThis.fetch = mock(async () => {
        await delay(50);
        return { ok: true };
      }) as unknown as typeof fetch;

      const startTime = Date.now();
      await handleReady();
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(500);
    }, 5000);

    test("should handle both checks failing gracefully", async () => {
      dbBehavior.connect = async () => {
        throw new Error("db down");
      };
      globalThis.fetch = mock(async () => {
        throw new Error("unreachable");
      }) as unknown as typeof fetch;

      const result = await handleReady();

      expect(result.db).toBe("down");
      expect(result.llm).toBe("down");
    });

    test("should run db and llm checks in parallel", async () => {
      dbBehavior.connect = async () => {
        await delay(120);
      };
      globalThis.fetch = mock(async () => {
        await delay(120);
        return { ok: true };
      }) as unknown as typeof fetch;

      const startTime = Date.now();
      await handleReady();
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(200);
    }, 5000);
  });

  describe("Edge Cases", () => {
    test("handleHealth should not throw any errors", () => {
      expect(() => handleHealth()).not.toThrow();
    });

    test("handleReady should not throw errors with configured env vars", async () => {
      await expect(handleReady()).resolves.toBeDefined();
    });
  });
});
