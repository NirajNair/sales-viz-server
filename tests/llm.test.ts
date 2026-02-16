import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";

describe("LLM Module", () => {
  let getMappingSuggestion: typeof import("../src/lib/llm/mapping").getMappingSuggestion;
  let getBatchMappingSuggestions: typeof import("../src/lib/llm/mapping").getBatchMappingSuggestions;
  let llmModule: typeof import("../src/lib/llm");
  let mappingModule: typeof import("../src/lib/llm/mapping");

  let mockOpenAIResponse: any = null;
  let mockOpenAIError: any = null;

  beforeAll(async () => {
    // Mock config first
    mock.module("../src/lib/config", () => ({
      config: {
        env: "test",
        db: {
          url: "postgresql://127.0.0.1:5432",
          host: "127.0.0.1",
          port: 5432,
        },
        llm: {
          url: "http://localhost:8080",
        },
        server: {
          port: 3000,
        },
        logs: {
          dir: "/tmp",
          level: "info",
        },
      },
    }));

    const mockLogger = {
      info: mock(() => {}),
      warn: mock(() => {}),
      error: mock(() => {}),
    };

    mock.module("../src/lib/logger", () => ({
      logger: mockLogger,
      loggerWithContext: mockLogger,
    }));

    // Import llm module after mocking config (for openaiClient)
    llmModule = await import("../src/lib/llm");
    mappingModule = await import("../src/lib/llm/mapping");
    getMappingSuggestion = mappingModule.getMappingSuggestion;
    getBatchMappingSuggestions = mappingModule.getBatchMappingSuggestions;
  });

  beforeEach(() => {
    mockOpenAIResponse = null;
    mockOpenAIError = null;

    // Inject mock OpenAI client
    const mockOpenAI = {
      chat: {
        completions: {
          create: async () => {
            if (mockOpenAIError) {
              throw mockOpenAIError;
            }
            if (!mockOpenAIResponse) {
              throw new Error("OpenAI mock response not set");
            }
            return mockOpenAIResponse;
          },
        },
      },
    };
    llmModule.openaiClient.set(mockOpenAI as any);
  });

  afterAll(() => {
    mock.restore();
  });

  describe("getMappingSuggestion", () => {
    test("should return valid suggestion for successful response", async () => {
      mockOpenAIResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                should_split: false,
                delimiter: null,
                map_to: "purchaseRecords.id",
                parts: [],
              }),
            },
          },
        ],
      };

      const result = await getMappingSuggestion({
        header: "ID",
        sampleValue: "123",
      });

      expect(result.should_split).toBe(false);
      expect(result.delimiter).toBeNull();
      expect(result.map_to).toBe("purchaseRecords.id");
    });

    test("should return suggestion with parts when splitting", async () => {
      mockOpenAIResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                should_split: true,
                delimiter: "/",
                map_to: null,
                parts: [
                  { index: 0, map_to: "purchaseRecords.col1" },
                  { index: 1, map_to: "purchaseRecords.col2" },
                ],
              }),
            },
          },
        ],
      };

      const result = await getMappingSuggestion({
        header: "Combined/Field",
        sampleValue: "value1/value2",
      });

      expect(result.should_split).toBe(true);
      expect(result.delimiter).toBe("/");
      expect(result.parts).toHaveLength(2);
    });

    test("should throw LLM_TIMEOUT error on timeout", async () => {
      mockOpenAIError = new Error("timeout");
      (mockOpenAIError as any).code = "ECONNABORTED";

      await expect(
        getMappingSuggestion({ header: "Test", sampleValue: "value" }),
      ).rejects.toThrow("LLM request timed out");
    });

    test("should throw LLM_UNREACHABLE error on connection refused", async () => {
      mockOpenAIError = new Error("Connection refused");
      (mockOpenAIError as any).code = "ECONNREFUSED";

      await expect(
        getMappingSuggestion({ header: "Test", sampleValue: "value" }),
      ).rejects.toThrow("Failed to reach LLM endpoint");
    });

    test("should throw LLM_BAD_RESPONSE error on invalid response structure", async () => {
      mockOpenAIResponse = {
        choices: [], // Empty choices array
      };

      await expect(
        getMappingSuggestion({ header: "Test", sampleValue: "value" }),
      ).rejects.toThrow("LLM response did not include content text");
    });

    test("should throw LLM_BAD_RESPONSE error on invalid JSON", async () => {
      mockOpenAIResponse = {
        choices: [
          {
            message: {
              content: "not valid json",
            },
          },
        ],
      };

      await expect(
        getMappingSuggestion({ header: "Test", sampleValue: "value" }),
      ).rejects.toThrow("LLM returned malformed JSON");
    });

    test("should throw LLM_BAD_RESPONSE error on schema mismatch", async () => {
      mockOpenAIResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                should_split: "invalid",
                delimiter: null,
                map_to: null,
                parts: [],
              }),
            },
          },
        ],
      };

      await expect(
        getMappingSuggestion({ header: "Test", sampleValue: "value" }),
      ).rejects.toThrow("LLM JSON did not match schema");
    });
  });

  describe("getBatchMappingSuggestions", () => {
    test("should return valid suggestions for multiple columns", async () => {
      const batchResponse = {
        columns: [
          {
            header: "ID",
            should_split: false,
            delimiter: null,
            map_to: "purchaseRecords.id",
            parts: [],
          },
          {
            header: "Name/Type",
            should_split: true,
            delimiter: "/",
            map_to: null,
            parts: [
              { index: 0, map_to: "purchaseRecords.name" },
              { index: 1, map_to: "purchaseRecords.type" },
            ],
          },
        ],
      };

      mockOpenAIResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify(batchResponse),
            },
          },
        ],
      };

      const result = await getBatchMappingSuggestions([
        { header: "ID", sampleValue: "123" },
        { header: "Name/Type", sampleValue: "Product/A" },
      ]);

      expect(result.columns).toHaveLength(2);
      expect(result.columns[0].header).toBe("ID");
      expect(result.columns[1].header).toBe("Name/Type");
      expect(result.columns[1].should_split).toBe(true);
    });

    test("should throw error on invalid batch response structure", async () => {
      mockOpenAIResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({ invalid: "structure" }),
            },
          },
        ],
      };

      await expect(
        getBatchMappingSuggestions([{ header: "Test", sampleValue: "value" }]),
      ).rejects.toThrow("LLM JSON did not match schema");
    });

    test("should throw error on timeout", async () => {
      mockOpenAIError = new Error("timeout");
      (mockOpenAIError as any).code = "ETIMEDOUT";

      await expect(
        getBatchMappingSuggestions([{ header: "Test", sampleValue: "value" }]),
      ).rejects.toThrow("LLM request timed out");
    });
  });
});
