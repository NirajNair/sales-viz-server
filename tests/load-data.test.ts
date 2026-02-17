import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { Context } from "elysia";
import type { Mapping } from "../src/dto/load-data.dto";
import {
  createHandleGetMappings,
  createHandleLoadData,
} from "../src/handlers/load-data";
import type { ParsedExcel } from "../src/lib/excel";
import type { LlmBatchSuggestion } from "../src/lib/llm/types";

describe("Load Data Handler", () => {
  const mockLogger = {
    warn: mock(() => {}),
    info: mock(() => {}),
    error: mock(() => {}),
  };

  const parseExcelMock = mock<(file: File) => Promise<ParsedExcel>>(
    async () => {
      throw new Error("parseExcel not mocked");
    },
  );

  let mockBatchResponse: LlmBatchSuggestion | null = null;
  let mockBatchError: Error | null = null;

  const getBatchMappingSuggestionsMock = mock<
    (
      samples: Array<{ header: string; sampleValue: string }>,
    ) => Promise<LlmBatchSuggestion>
  >(async () => {
    if (mockBatchError) {
      throw mockBatchError;
    }
    if (!mockBatchResponse) {
      throw new Error("Batch mock response not set");
    }
    return mockBatchResponse;
  });

  const handleGetMappings = createHandleGetMappings({
    parseExcel: parseExcelMock,
    getBatchMappingSuggestions: getBatchMappingSuggestionsMock,
    loggerWithContext: mockLogger,
  });

  beforeEach(() => {
    parseExcelMock.mockClear();
    getBatchMappingSuggestionsMock.mockClear();
    mockBatchResponse = null;
    mockBatchError = null;
  });

  function createMockContext(
    file?: File,
    options: { invalidFormData?: boolean } = {},
  ): Context {
    const set = { status: 200 } as { status: number };

    return {
      request: {
        formData: async () => {
          if (options.invalidFormData) {
            throw new Error("Invalid form data");
          }
          const formData = new FormData();
          if (file) {
            formData.append("file", file);
          }
          return formData;
        },
      },
      set,
      store: {
        logger: {
          warn: mock(() => {}),
          info: mock(() => {}),
          error: mock(() => {}),
        },
      },
    } as unknown as Context;
  }

  function createMockFile(
    name: string,
    type: string,
    size: number = 1024,
  ): File {
    const blob = new Blob(["test content".repeat(100)], { type });
    return new File([blob], name, { type });
  }

  describe("File Validation", () => {
    test("should throw error when form data cannot be parsed", async () => {
      const ctx = createMockContext(undefined, { invalidFormData: true });

      await expect(handleGetMappings(ctx)).rejects.toThrow("Invalid form data");
    });

    test("should throw error when no file is provided", async () => {
      const ctx = createMockContext();

      await expect(handleGetMappings(ctx)).rejects.toThrow("Invalid input");
    });

    test("should throw error for empty file", async () => {
      const file = new File([], "test.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const ctx = createMockContext(file);

      await expect(handleGetMappings(ctx)).rejects.toThrow("File is empty");
    });

    test("should throw error for invalid file extension", async () => {
      const file = createMockFile("test.pdf", "application/pdf");
      const ctx = createMockContext(file);

      await expect(handleGetMappings(ctx)).rejects.toThrow(
        "Only .xlsx or .xls files are supported",
      );
    });

    test("should accept .xlsx files", async () => {
      parseExcelMock.mockResolvedValue({
        columns: [{ index: 0, header: "Test", sampleValue: "value" }],
      });

      mockBatchResponse = {
        columns: [
          {
            header: "Test",
            should_split: false,
            delimiter: null,
            map_to: null,
            parts: [],
          },
        ],
      };

      const file = createMockFile(
        "test.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      const ctx = createMockContext(file);

      const result = await handleGetMappings(ctx);

      expect(result.columns).toBeDefined();
    });

    test("should accept .xls files", async () => {
      parseExcelMock.mockResolvedValue({
        columns: [{ index: 0, header: "Test", sampleValue: "value" }],
      });

      mockBatchResponse = {
        columns: [
          {
            header: "Test",
            should_split: false,
            delimiter: null,
            map_to: null,
            parts: [],
          },
        ],
      };

      const file = createMockFile("test.xls", "application/vnd.ms-excel");
      const ctx = createMockContext(file);

      const result = await handleGetMappings(ctx);

      expect(result.columns).toBeDefined();
    });
  });

  describe("Excel Parsing", () => {
    test("should throw error when Excel parsing fails", async () => {
      parseExcelMock.mockRejectedValue(new Error("Invalid Excel format"));

      const file = createMockFile(
        "test.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      const ctx = createMockContext(file);

      await expect(handleGetMappings(ctx)).rejects.toThrow(
        "Invalid Excel format",
      );
    });

    test("should handle parseExcel error with non-Error object", async () => {
      parseExcelMock.mockRejectedValue("String error");

      const file = createMockFile(
        "test.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      const ctx = createMockContext(file);

      await expect(handleGetMappings(ctx)).rejects.toThrow(
        "Failed to parse Excel file",
      );
    });
  });

  describe("LLM Mapping", () => {
    test("should successfully map columns using LLM", async () => {
      parseExcelMock.mockResolvedValue({
        columns: [
          { index: 0, header: "Invoice No", sampleValue: "INV001" },
          { index: 1, header: "Amount", sampleValue: "1000.00" },
        ],
      });

      mockBatchResponse = {
        columns: [
          {
            header: "Invoice No",
            should_split: false,
            delimiter: null,
            map_to: "purchase_records.invoice_no",
            parts: [],
          },
          {
            header: "Amount",
            should_split: false,
            delimiter: null,
            map_to: "purchase_records.assess_val",
            parts: [],
          },
        ],
      };

      const file = createMockFile(
        "test.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      const ctx = createMockContext(file);

      const result = await handleGetMappings(ctx);

      expect(ctx.set.status).toBe(200);
      expect(result.columns).toHaveLength(2);
      expect(result.llmSuggestions).toHaveLength(2);
      expect(result.llmSuggestions[0].header).toBe("Invoice No");
      expect(result.llmSuggestions[0].suggestion.mapTo).toBe(
        "purchase_records.invoice_no",
      );
    });

    test("should handle LLM timeout error", async () => {
      parseExcelMock.mockResolvedValue({
        columns: [{ index: 0, header: "Test", sampleValue: "value" }],
      });

      mockBatchError = new Error("LLM request timed out");

      const file = createMockFile(
        "test.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      const ctx = createMockContext(file);

      await expect(handleGetMappings(ctx)).rejects.toThrow(
        "LLM request timed out",
      );
    });

    test("should handle LLM unreachable error", async () => {
      parseExcelMock.mockResolvedValue({
        columns: [{ index: 0, header: "Test", sampleValue: "value" }],
      });

      mockBatchError = new Error("Failed to reach LLM endpoint");

      const file = createMockFile(
        "test.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      const ctx = createMockContext(file);

      await expect(handleGetMappings(ctx)).rejects.toThrow(
        "Failed to reach LLM endpoint",
      );
    });

    test("should handle LLM bad response error", async () => {
      parseExcelMock.mockResolvedValue({
        columns: [{ index: 0, header: "Test", sampleValue: "value" }],
      });

      mockBatchError = new Error("LLM returned malformed JSON");

      const file = createMockFile(
        "test.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      const ctx = createMockContext(file);

      await expect(handleGetMappings(ctx)).rejects.toThrow(
        "LLM returned malformed JSON",
      );
    });

    test("should handle generic errors as LLM_UNREACHABLE", async () => {
      parseExcelMock.mockResolvedValue({
        columns: [{ index: 0, header: "Test", sampleValue: "value" }],
      });

      mockBatchError = new Error("Failed to reach LLM endpoint");

      const file = createMockFile(
        "test.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      const ctx = createMockContext(file);

      await expect(handleGetMappings(ctx)).rejects.toThrow(
        "Failed to reach LLM endpoint",
      );
    });
  });

  describe("Response Structure", () => {
    test("should return correct response structure with columns and suggestions", async () => {
      parseExcelMock.mockResolvedValue({
        columns: [
          { index: 0, header: "Col1", sampleValue: "val1" },
          { index: 1, header: "Col2", sampleValue: "val2" },
        ],
      });

      mockBatchResponse = {
        columns: [
          {
            header: "Col1",
            should_split: true,
            delimiter: "-",
            map_to: null,
            parts: [
              {
                index: 0,
                map_to: "purchase_records.invoice_no",
              },
            ],
          },
          {
            header: "Col2",
            should_split: false,
            delimiter: null,
            map_to: "entities.gstin",
            parts: [],
          },
        ],
      };

      const file = createMockFile(
        "test.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      const ctx = createMockContext(file);

      const result = await handleGetMappings(ctx);

      expect(result).toHaveProperty("columns");
      expect(result).toHaveProperty("llmSuggestions");
      expect(result.columns).toHaveLength(2);
      expect(result.llmSuggestions).toHaveLength(2);

      expect(result.llmSuggestions[0]).toHaveProperty("header");
      expect(result.llmSuggestions[0]).toHaveProperty("suggestion");
      expect(result.llmSuggestions[0].suggestion).toHaveProperty("shouldSplit");
      expect(result.llmSuggestions[0].suggestion).toHaveProperty("delimiter");
      expect(result.llmSuggestions[0].suggestion).toHaveProperty("mapTo");
      expect(result.llmSuggestions[0].suggestion).toHaveProperty("parts");
    });
  });
});

describe("handleLoadData", () => {
  const mockLogger = {
    warn: mock(() => {}),
    info: mock(() => {}),
    error: mock(() => {}),
  };

  let mockLoadDataFromExcelResponse: number | null = null;
  let mockLoadDataFromExcelError: Error | null = null;

  const loadDataFromExcelMock = mock<
    (file: File, mappings: Mapping[], uploadId: string) => Promise<number>
  >(async () => {
    if (mockLoadDataFromExcelError) {
      throw mockLoadDataFromExcelError;
    }
    if (mockLoadDataFromExcelResponse === null) {
      throw new Error("loadDataFromExcel mock response not set");
    }
    return mockLoadDataFromExcelResponse;
  });

  let mockDbInsertResult: any[] = [{ id: "upload-1" }];

  const mockDb = {
    insert: mock(() => ({
      values: mock(() => ({
        returning: mock(async () => mockDbInsertResult),
      })),
    })),
  };

  const handleLoadData = createHandleLoadData({
    db: mockDb as any,
    loadDataFromExcel: loadDataFromExcelMock,
    loggerWithContext: mockLogger,
  });

  beforeEach(() => {
    loadDataFromExcelMock.mockClear();
    mockDb.insert.mockClear();
    mockLoadDataFromExcelResponse = null;
    mockLoadDataFromExcelError = null;
    mockDbInsertResult = [{ id: "upload-1" }];
  });

  function createMockContext(
    file?: File,
    mappings?: string,
    options: { invalidFormData?: boolean } = {},
  ): Context {
    const set = { status: 200 } as { status: number };

    return {
      request: {
        formData: async () => {
          if (options.invalidFormData) {
            throw new Error("Invalid form data");
          }
          const formData = new FormData();
          if (file) {
            formData.append("file", file);
          }
          if (mappings) {
            formData.append("mappings", mappings);
          }
          return formData;
        },
      },
      set,
      store: {
        logger: {
          warn: mock(() => {}),
          info: mock(() => {}),
          error: mock(() => {}),
        },
      },
    } as unknown as Context;
  }

  function createMockFile(
    name: string,
    type: string,
    size: number = 1024,
  ): File {
    const blob = new Blob(["test content".repeat(100)], { type });
    return new File([blob], name, { type });
  }

  describe("Form Data Validation", () => {
    test("should throw error when form data cannot be parsed", async () => {
      const ctx = createMockContext(undefined, undefined, {
        invalidFormData: true,
      });

      await expect(handleLoadData(ctx)).rejects.toThrow("Invalid form data");
    });

    test("should throw error when no file is provided", async () => {
      const mappings = JSON.stringify([]);
      const ctx = createMockContext(undefined, mappings);

      await expect(handleLoadData(ctx)).rejects.toThrow("No file provided");
    });

    test("should throw error when no mappings provided", async () => {
      const file = createMockFile(
        "test.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      const ctx = createMockContext(file, undefined);

      await expect(handleLoadData(ctx)).rejects.toThrow("No mappings provided");
    });
  });

  describe("Mappings Validation", () => {
    test("should throw error for invalid mappings JSON", async () => {
      const file = createMockFile(
        "test.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      const ctx = createMockContext(file, "invalid json");

      await expect(handleLoadData(ctx)).rejects.toThrow();
    });

    test("should throw error for missing mandatory fields", async () => {
      const file = createMockFile(
        "test.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      const mappings = JSON.stringify([
        {
          excelColumnIndex: 0,
          excelHeader: "Test",
          sampleValue: "value",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "seller_entity.gstin",
          parts: [],
        },
      ]);
      const ctx = createMockContext(file, mappings);

      await expect(handleLoadData(ctx)).rejects.toThrow(
        "Missing mandatory field mappings",
      );
    });
  });

  describe("Successful Load", () => {
    test("should successfully load data and return count", async () => {
      const file = createMockFile(
        "test.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      const mappings = JSON.stringify([
        {
          excelColumnIndex: 0,
          excelHeader: "Seller GSTIN",
          sampleValue: "29ABCDE1234F1Z5",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "seller_entity.gstin",
          parts: [],
        },
        {
          excelColumnIndex: 1,
          excelHeader: "Seller Name",
          sampleValue: "Test Seller",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "seller_entity.name",
          parts: [],
        },
        {
          excelColumnIndex: 2,
          excelHeader: "Buyer GSTIN",
          sampleValue: "27XYZAB5678G1H9",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "buyer_entity.gstin",
          parts: [],
        },
        {
          excelColumnIndex: 3,
          excelHeader: "Buyer Name",
          sampleValue: "Test Buyer",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "buyer_entity.name",
          parts: [],
        },
        {
          excelColumnIndex: 4,
          excelHeader: "Amount",
          sampleValue: "1000.00",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "purchase_records.assess_val",
          parts: [],
        },
        {
          excelColumnIndex: 5,
          excelHeader: "HSN Code",
          sampleValue: "1234",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "hsn_codes.code",
          parts: [],
        },
      ]);

      mockLoadDataFromExcelResponse = 5;

      const ctx = createMockContext(file, mappings);
      const result = await handleLoadData(ctx);

      expect(result).toEqual({
        recordsStoredCount: 5,
      });
      expect(loadDataFromExcelMock).toHaveBeenCalledTimes(1);
      expect(mockDb.insert).toHaveBeenCalledTimes(1);
    });

    test("should filter out unmapped columns", async () => {
      const file = createMockFile(
        "test.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      const mappings = JSON.stringify([
        {
          excelColumnIndex: 0,
          excelHeader: "Seller GSTIN",
          sampleValue: "29ABCDE1234F1Z5",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "seller_entity.gstin",
          parts: [],
        },
        {
          excelColumnIndex: 1,
          excelHeader: "Seller Name",
          sampleValue: "Test Seller",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "seller_entity.name",
          parts: [],
        },
        {
          excelColumnIndex: 2,
          excelHeader: "Buyer GSTIN",
          sampleValue: "27XYZAB5678G1H9",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "buyer_entity.gstin",
          parts: [],
        },
        {
          excelColumnIndex: 3,
          excelHeader: "Buyer Name",
          sampleValue: "Test Buyer",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "buyer_entity.name",
          parts: [],
        },
        {
          excelColumnIndex: 4,
          excelHeader: "Amount",
          sampleValue: "1000.00",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "purchase_records.assess_val",
          parts: [],
        },
        {
          excelColumnIndex: 5,
          excelHeader: "HSN Code",
          sampleValue: "1234",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "hsn_codes.code",
          parts: [],
        },
        {
          excelColumnIndex: 6,
          excelHeader: "Unmapped Column",
          sampleValue: "ignored",
          shouldSplit: false,
          delimiter: null,
          mappedTo: null,
          parts: [],
        },
      ]);

      mockLoadDataFromExcelResponse = 3;

      const ctx = createMockContext(file, mappings);
      await handleLoadData(ctx);

      expect(loadDataFromExcelMock).toHaveBeenCalledTimes(1);
      const calledMappings = loadDataFromExcelMock.mock.calls[0][1];
      expect(calledMappings).toHaveLength(6); // Unmapped column filtered out
    });

    test("should keep mappings with parts that have mapTo", async () => {
      const file = createMockFile(
        "test.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      const mappings = JSON.stringify([
        {
          excelColumnIndex: 0,
          excelHeader: "Combined",
          sampleValue: "GSTIN-Name",
          shouldSplit: true,
          delimiter: "-",
          mappedTo: null,
          parts: [
            {
              index: 0,
              name: "GSTIN",
              mapTo: "seller_entity.gstin",
            },
            {
              index: 1,
              name: "Name",
              mapTo: "seller_entity.name",
            },
          ],
        },
        {
          excelColumnIndex: 1,
          excelHeader: "Buyer GSTIN",
          sampleValue: "27XYZAB5678G1H9",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "buyer_entity.gstin",
          parts: [],
        },
        {
          excelColumnIndex: 2,
          excelHeader: "Buyer Name",
          sampleValue: "Test Buyer",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "buyer_entity.name",
          parts: [],
        },
        {
          excelColumnIndex: 3,
          excelHeader: "Amount",
          sampleValue: "1000.00",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "purchase_records.assess_val",
          parts: [],
        },
        {
          excelColumnIndex: 4,
          excelHeader: "HSN Code",
          sampleValue: "1234",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "hsn_codes.code",
          parts: [],
        },
      ]);

      mockLoadDataFromExcelResponse = 2;

      const ctx = createMockContext(file, mappings);
      await handleLoadData(ctx);

      expect(loadDataFromExcelMock).toHaveBeenCalledTimes(1);
      const calledMappings = loadDataFromExcelMock.mock.calls[0][1];
      expect(calledMappings).toHaveLength(5);
    });
  });

  describe("Error Handling", () => {
    test("should rethrow ValidationError for Missing fields", async () => {
      const file = createMockFile(
        "test.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      const mappings = JSON.stringify([
        {
          excelColumnIndex: 0,
          excelHeader: "Seller GSTIN",
          sampleValue: "29ABCDE1234F1Z5",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "seller_entity.gstin",
          parts: [],
        },
        {
          excelColumnIndex: 1,
          excelHeader: "Seller Name",
          sampleValue: "Test Seller",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "seller_entity.name",
          parts: [],
        },
        {
          excelColumnIndex: 2,
          excelHeader: "Buyer GSTIN",
          sampleValue: "27XYZAB5678G1H9",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "buyer_entity.gstin",
          parts: [],
        },
        {
          excelColumnIndex: 3,
          excelHeader: "Buyer Name",
          sampleValue: "Test Buyer",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "buyer_entity.name",
          parts: [],
        },
        {
          excelColumnIndex: 4,
          excelHeader: "Amount",
          sampleValue: "1000.00",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "purchase_records.assess_val",
          parts: [],
        },
        {
          excelColumnIndex: 5,
          excelHeader: "HSN Code",
          sampleValue: "1234",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "hsn_codes.code",
          parts: [],
        },
      ]);

      mockLoadDataFromExcelError = new Error("Missing seller GSTIN");

      const ctx = createMockContext(file, mappings);

      await expect(handleLoadData(ctx)).rejects.toThrow("Missing seller GSTIN");
    });

    test("should rethrow other errors as-is", async () => {
      const file = createMockFile(
        "test.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      const mappings = JSON.stringify([
        {
          excelColumnIndex: 0,
          excelHeader: "Seller GSTIN",
          sampleValue: "29ABCDE1234F1Z5",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "seller_entity.gstin",
          parts: [],
        },
        {
          excelColumnIndex: 1,
          excelHeader: "Seller Name",
          sampleValue: "Test Seller",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "seller_entity.name",
          parts: [],
        },
        {
          excelColumnIndex: 2,
          excelHeader: "Buyer GSTIN",
          sampleValue: "27XYZAB5678G1H9",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "buyer_entity.gstin",
          parts: [],
        },
        {
          excelColumnIndex: 3,
          excelHeader: "Buyer Name",
          sampleValue: "Test Buyer",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "buyer_entity.name",
          parts: [],
        },
        {
          excelColumnIndex: 4,
          excelHeader: "Amount",
          sampleValue: "1000.00",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "purchase_records.assess_val",
          parts: [],
        },
        {
          excelColumnIndex: 5,
          excelHeader: "HSN Code",
          sampleValue: "1234",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "hsn_codes.code",
          parts: [],
        },
      ]);

      mockLoadDataFromExcelError = new Error("Database connection failed");

      const ctx = createMockContext(file, mappings);

      await expect(handleLoadData(ctx)).rejects.toThrow(
        "Database connection failed",
      );
    });
  });
});
