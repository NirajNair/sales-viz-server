import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { Context } from "elysia";
import { createHandleRevertUpload } from "../src/handlers/upload";
import type { AppError } from "../src/lib/errors";
describe("Revert Upload Handler", () => {
  const mockLogger = {
    error: mock(() => {}),
    info: mock(() => {}),
  };
  let mockDb: any;
  let handleRevertUpload: ReturnType<typeof createHandleRevertUpload>;
  beforeEach(() => {
    mockLogger.error.mockClear();
    mockLogger.info.mockClear();
    // Setup mock db with chainable interface
    // Handler flow: db.select().from().where().limit(1) - where returns chain, limit returns Promise
    const createChain = (limitResult: unknown[] = []) => {
      const chain: any = {
        select: mock(() => chain),
        from: mock(() => chain),
        where: mock(() => chain),
        limit: mock(() => Promise.resolve(limitResult)),
        delete: mock(() => ({
          where: mock(() => Promise.resolve({ rowCount: 0 })),
        })),
        update: mock(() => ({
          set: mock(() => ({
            where: mock(() => Promise.resolve({ rowCount: 1 })),
          })),
        })),
        returning: mock(() => Promise.resolve([])),
      };
      return chain;
    };
    mockDb = createChain();
    mockDb.transaction = mock((callback: Function) => {
      const txChain = createChain();
      return callback(txChain);
    });
    handleRevertUpload = createHandleRevertUpload({
      db: mockDb,
      loggerWithContext: mockLogger,
    });
  });
  function createMockContext(uploadId: string): Context {
    return {
      params: { uploadId },
    } as unknown as Context;
  }
  describe("Success Cases", () => {
    test("should successfully revert upload with records", async () => {
      const uploadId = "550e8400-e29b-41d4-a716-446655440000";

      // Mock upload exists and not reverted
      mockDb.limit = mock(() =>
        Promise.resolve([
          {
            id: uploadId,
            fileName: "test.xlsx",
            reverted: false,
          },
        ]),
      );
      // Mock transaction - returns [purchaseRecordsResult] from Promise.all
      mockDb.transaction = mock(() => {
        return Promise.resolve([{ rowCount: 3 }]);
      });
      const ctx = createMockContext(uploadId);
      const result = await handleRevertUpload(ctx);
      expect(result.deletedRecordsCount).toBe(3);
      expect(mockLogger.info).toHaveBeenCalled();
    });
    test("should successfully revert upload with no records", async () => {
      const uploadId = "550e8400-e29b-41d4-a716-446655440001";

      // Mock upload exists and not reverted
      mockDb.limit = mock(() =>
        Promise.resolve([
          {
            id: uploadId,
            fileName: "test.xlsx",
            reverted: false,
          },
        ]),
      );
      // Mock transaction - returns [purchaseRecordsResult] from Promise.all
      mockDb.transaction = mock(() => {
        return Promise.resolve([{ rowCount: 0 }]);
      });
      const ctx = createMockContext(uploadId);
      const result = await handleRevertUpload(ctx);
      expect(result.deletedRecordsCount).toBe(0);
    });
  });
  describe("Validation Errors", () => {
    test("should throw error for invalid UUID format", async () => {
      const ctx = createMockContext("invalid-uuid");
      await expect(handleRevertUpload(ctx)).rejects.toThrow(
        "Invalid upload ID format",
      );
    });
    test("should throw error when upload not found", async () => {
      const uploadId = "550e8400-e29b-41d4-a716-446655440002";

      mockDb.limit = mock(() => Promise.resolve([]));
      const ctx = createMockContext(uploadId);
      await expect(handleRevertUpload(ctx)).rejects.toThrow(
        `Upload with ID "${uploadId}" not found`,
      );
    });
    test("should throw error when upload already reverted", async () => {
      const uploadId = "550e8400-e29b-41d4-a716-446655440003";

      mockDb.limit = mock(() =>
        Promise.resolve([
          {
            id: uploadId,
            fileName: "test.xlsx",
            reverted: true,
          },
        ]),
      );
      const ctx = createMockContext(uploadId);
      await expect(handleRevertUpload(ctx)).rejects.toThrow(
        "Upload has already been reverted",
      );
    });
  });
  describe("Database Errors", () => {
    test("should throw error when transaction fails", async () => {
      const uploadId = "550e8400-e29b-41d4-a716-446655440004";

      mockDb.limit = mock(() =>
        Promise.resolve([
          {
            id: uploadId,
            fileName: "test.xlsx",
            reverted: false,
          },
        ]),
      );
      mockDb.transaction = mock(() =>
        Promise.reject(new Error("Database connection lost")),
      );
      const ctx = createMockContext(uploadId);
      await expect(handleRevertUpload(ctx)).rejects.toThrow(
        "Database connection lost",
      );
    });
    test("should handle error during purchase records deletion", async () => {
      const uploadId = "550e8400-e29b-41d4-a716-446655440005";

      mockDb.limit = mock(() =>
        Promise.resolve([
          {
            id: uploadId,
            fileName: "test.xlsx",
            reverted: false,
          },
        ]),
      );
      mockDb.transaction = mock(() => {
        throw new Error("Transaction failed");
      });
      const ctx = createMockContext(uploadId);
      await expect(handleRevertUpload(ctx)).rejects.toThrow(
        "Transaction failed",
      );
    });
  });
  describe("Edge Cases", () => {
    test("should handle upload ID with different valid UUID formats", async () => {
      const uploadId = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

      mockDb.limit = mock(() =>
        Promise.resolve([
          {
            id: uploadId,
            fileName: "test.xlsx",
            reverted: false,
          },
        ]),
      );
      mockDb.transaction = mock(() => {
        return Promise.resolve([{ rowCount: 1 }]);
      });
      const ctx = createMockContext(uploadId);
      const result = await handleRevertUpload(ctx);
      expect(result.deletedRecordsCount).toBe(1);
    });
    test("should log success after revert", async () => {
      const uploadId = "550e8400-e29b-41d4-a716-446655440006";

      mockDb.limit = mock(() =>
        Promise.resolve([
          {
            id: uploadId,
            fileName: "test.xlsx",
            reverted: false,
          },
        ]),
      );
      mockDb.transaction = mock(() => {
        return Promise.resolve([{ rowCount: 1 }]);
      });
      const ctx = createMockContext(uploadId);
      await handleRevertUpload(ctx);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          uploadId,
          purchaseRecordsDeletedCount: 1,
        }),
        "Upload reverted successfully",
      );
    });
    test("should throw ValidationError with status 400 for already reverted", async () => {
      const uploadId = "550e8400-e29b-41d4-a716-446655440007";

      mockDb.limit = mock(() =>
        Promise.resolve([
          {
            id: uploadId,
            fileName: "test.xlsx",
            reverted: true,
          },
        ]),
      );
      const ctx = createMockContext(uploadId);
      try {
        await handleRevertUpload(ctx);
        throw new Error("Should have thrown an error");
      } catch (error) {
        expect((error as Error).message).toBe(
          "Upload has already been reverted",
        );
        const appError = error as AppError;
        expect(appError.statusCode).toBe(400);
        expect(appError.code).toBe("VALIDATION_ERROR");
      }
    });
    test("should throw ValidationError with status 400 for missing upload", async () => {
      const uploadId = "550e8400-e29b-41d4-a716-446655440008";

      mockDb.limit = mock(() => Promise.resolve([]));
      const ctx = createMockContext(uploadId);
      try {
        await handleRevertUpload(ctx);
        throw new Error("Should have thrown an error");
      } catch (error) {
        expect((error as Error).message).toBe(
          `Upload with ID "${uploadId}" not found`,
        );
        const appError = error as AppError;
        expect(appError.statusCode).toBe(400);
        expect(appError.code).toBe("VALIDATION_ERROR");
      }
    });
  });
});
