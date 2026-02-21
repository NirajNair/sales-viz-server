import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { Context } from "elysia";
import {
  createHandleGetUploads,
  createHandleRevertUpload,
} from "../src/handlers/upload";
import type { AppError } from "../src/lib/errors";

const mockLogger = {
  error: mock(() => {}),
  info: mock(() => {}),
};

describe("Revert Upload Handler", () => {
  let mockDb: any;
  let handleRevertUpload: ReturnType<typeof createHandleRevertUpload>;
  beforeEach(() => {
    mockLogger.error.mockClear();
    mockLogger.info.mockClear();

    // Setup mock db with chainable interface
    const createChain = (limitResult: unknown[] = []) => {
      const chain: any = {
        select: mock((fields?: any) => {
          chain._selectFields = fields;
          return chain;
        }),
        from: mock((table: any) => {
          chain._table = table;
          return chain;
        }),
        where: mock((condition: any) => {
          chain._where = condition;
          return chain;
        }),
        limit: mock(() => Promise.resolve(limitResult)),
        delete: mock(() => ({
          where: mock(() => Promise.resolve({ rowCount: 0 })),
        })),
        update: mock(() => ({
          set: mock(() => ({
            where: mock(() => Promise.resolve({ rowCount: 1 })),
          })),
        })),
        leftJoin: mock(() => chain),
        groupBy: mock(() => Promise.resolve([])),
        returning: mock(() => Promise.resolve([])),
      };
      return chain;
    };

    mockDb = createChain();

    // Mock transaction to handle the single-transaction cleanup process
    mockDb.transaction = mock((callback: Function) => {
      const txChain = {
        select: mock((fields?: any) => ({
          from: mock((table: any) => ({
            leftJoin: mock(() => ({
              where: mock(() => ({
                groupBy: mock(() => Promise.resolve([])),
              })),
            })),
            where: mock(() => Promise.resolve([])),
          })),
        })),
        delete: mock(() => ({
          where: mock(() => Promise.resolve({ rowCount: 3 })),
        })),
        update: mock(() => ({
          set: mock(() => ({
            where: mock(() => Promise.resolve({ rowCount: 1 })),
          })),
        })),
      };
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
      // Mock transaction - now returns single count value
      mockDb.transaction = mock((callback: Function) => {
        const txChain = {
          select: mock((fields?: any) => ({
            from: mock((table: any) => ({
              leftJoin: mock(() => ({
                where: mock(() => ({
                  groupBy: mock(() => Promise.resolve([])),
                })),
              })),
            })),
          })),
          delete: mock(() => ({
            where: mock(() => Promise.resolve({ rowCount: 3 })),
          })),
          update: mock(() => ({
            set: mock(() => ({
              where: mock(() => Promise.resolve({ rowCount: 1 })),
            })),
          })),
        };
        return callback(txChain);
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
      // Mock transaction - now returns single count value
      mockDb.transaction = mock((callback: Function) => {
        const txChain = {
          select: mock((fields?: any) => ({
            from: mock((table: any) => ({
              leftJoin: mock(() => ({
                where: mock(() => ({
                  groupBy: mock(() => Promise.resolve([])),
                })),
              })),
            })),
          })),
          delete: mock(() => ({
            where: mock(() => Promise.resolve({ rowCount: 0 })),
          })),
          update: mock(() => ({
            set: mock(() => ({
              where: mock(() => Promise.resolve({ rowCount: 1 })),
            })),
          })),
        };
        return callback(txChain);
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
      mockDb.transaction = mock((callback: Function) => {
        const txChain = {
          select: mock((fields?: any) => ({
            from: mock((table: any) => ({
              leftJoin: mock(() => ({
                where: mock(() => ({
                  groupBy: mock(() => Promise.resolve([])),
                })),
              })),
            })),
          })),
          delete: mock(() => ({
            where: mock(() => Promise.resolve({ rowCount: 1 })),
          })),
          update: mock(() => ({
            set: mock(() => ({
              where: mock(() => Promise.resolve({ rowCount: 1 })),
            })),
          })),
        };
        return callback(txChain);
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
      mockDb.transaction = mock((callback: Function) => {
        const txChain = {
          select: mock((fields?: any) => ({
            from: mock((table: any) => ({
              leftJoin: mock(() => ({
                where: mock(() => ({
                  groupBy: mock(() => Promise.resolve([])),
                })),
              })),
            })),
          })),
          delete: mock(() => ({
            where: mock(() => Promise.resolve({ rowCount: 1 })),
          })),
          update: mock(() => ({
            set: mock(() => ({
              where: mock(() => Promise.resolve({ rowCount: 1 })),
            })),
          })),
        };
        return callback(txChain);
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

describe("Get Uploads Handler", () => {
    let mockDb: any;
    let handleGetUploads: ReturnType<typeof createHandleGetUploads>;

    beforeEach(() => {
      mockLogger.info.mockClear();
      // Setup mock db for get uploads - needs select().from().orderBy() chain
      mockDb = {
        select: mock(() => mockDb),
        from: mock(() => mockDb),
        orderBy: mock(() => Promise.resolve([])),
      };
      handleGetUploads = createHandleGetUploads({
        db: mockDb,
        loggerWithContext: mockLogger,
      });
    });

  describe("Success Cases", () => {
    test("should successfully return all uploads sorted by createdAt DESC", async () => {
      const mockUploads = [
        {
          uploadId: "550e8400-e29b-41d4-a716-446655440003",
          fileName: "latest.xlsx",
          fileSize: 2048,
          reverted: false,
          createdAt: new Date("2026-02-17T12:00:00Z"),
        },
        {
          uploadId: "550e8400-e29b-41d4-a716-446655440002",
          fileName: "middle.xlsx",
          fileSize: 1024,
          reverted: true,
          createdAt: new Date("2026-02-16T10:00:00Z"),
        },
        {
          uploadId: "550e8400-e29b-41d4-a716-446655440001",
          fileName: "oldest.xlsx",
          fileSize: 512,
          reverted: false,
          createdAt: new Date("2026-02-15T08:00:00Z"),
        },
      ];

      mockDb.orderBy = mock(() => Promise.resolve(mockUploads));

      const result = await handleGetUploads();

      expect(result.uploads).toHaveLength(3);
      expect(result.uploads[0].fileName).toBe("latest.xlsx");
      expect(result.uploads[2].fileName).toBe("oldest.xlsx");
      expect(mockDb.select).toHaveBeenCalled();
      expect(mockDb.from).toHaveBeenCalled();
      expect(mockDb.orderBy).toHaveBeenCalled();
    });

    test("should return empty array when no uploads exist", async () => {
      mockDb.orderBy = mock(() => Promise.resolve([]));

      const result = await handleGetUploads();

      expect(result.uploads).toEqual([]);
      expect(result.uploads).toHaveLength(0);
    });

    test("should include all required fields in response", async () => {
      const mockUploads = [
        {
          uploadId: "550e8400-e29b-41d4-a716-446655440000",
          fileName: "test.xlsx",
          fileSize: 1024,
          reverted: false,
          createdAt: new Date("2026-02-17T10:30:00Z"),
        },
      ];

      mockDb.orderBy = mock(() => Promise.resolve(mockUploads));

      const result = await handleGetUploads();

      expect(result.uploads).toHaveLength(1);
      const upload = result.uploads[0];
      expect(upload.uploadId).toBe("550e8400-e29b-41d4-a716-446655440000");
      expect(upload.fileName).toBe("test.xlsx");
      expect(upload.fileSize).toBe(1024);
      expect(upload.reverted).toBe(false);
      expect(upload.createdAt).toBeInstanceOf(Date);
      expect(upload.createdAt).toEqual(new Date("2026-02-17T10:30:00Z"));
    });

    test("should include both reverted and non-reverted uploads", async () => {
      const mockUploads = [
        {
          uploadId: "550e8400-e29b-41d4-a716-446655440001",
          fileName: "active.xlsx",
          fileSize: 1024,
          reverted: false,
          createdAt: new Date("2026-02-17T10:00:00Z"),
        },
        {
          uploadId: "550e8400-e29b-41d4-a716-446655440002",
          fileName: "reverted.xlsx",
          fileSize: 2048,
          reverted: true,
          createdAt: new Date("2026-02-16T09:00:00Z"),
        },
      ];

      mockDb.orderBy = mock(() => Promise.resolve(mockUploads));

      const result = await handleGetUploads();

      expect(result.uploads).toHaveLength(2);
      expect(result.uploads.some((u) => u.reverted === false)).toBe(true);
      expect(result.uploads.some((u) => u.reverted === true)).toBe(true);
    });
  });

  describe("Database Errors", () => {
    test("should throw error when database query fails", async () => {
      mockDb.orderBy = mock(() =>
        Promise.reject(new Error("Database connection failed")),
      );

      await expect(handleGetUploads()).rejects.toThrow(
        "Database connection failed",
      );
    });

    test("should throw error when select fails", async () => {
      mockDb.select = mock(() => {
        throw new Error("Query failed");
      });

      await expect(handleGetUploads()).rejects.toThrow("Query failed");
    });
  });

  describe("Edge Cases", () => {
    test("should handle single upload correctly", async () => {
      const mockUploads = [
        {
          uploadId: "550e8400-e29b-41d4-a716-446655440000",
          fileName: "single.xlsx",
          fileSize: 1024,
          reverted: false,
          createdAt: new Date("2026-02-17T10:30:00Z"),
        },
      ];

      mockDb.orderBy = mock(() => Promise.resolve(mockUploads));

      const result = await handleGetUploads();

      expect(result.uploads).toHaveLength(1);
      expect(result.uploads[0].fileName).toBe("single.xlsx");
    });

    test("should handle uploads with different file sizes", async () => {
      const mockUploads = [
        {
          uploadId: "550e8400-e29b-41d4-a716-446655440001",
          fileName: "small.xlsx",
          fileSize: 100,
          reverted: false,
          createdAt: new Date("2026-02-17T12:00:00Z"),
        },
        {
          uploadId: "550e8400-e29b-41d4-a716-446655440002",
          fileName: "large.xlsx",
          fileSize: 10485760,
          reverted: false,
          createdAt: new Date("2026-02-16T10:00:00Z"),
        },
      ];

      mockDb.orderBy = mock(() => Promise.resolve(mockUploads));

      const result = await handleGetUploads();

      expect(result.uploads[0].fileSize).toBe(100);
      expect(result.uploads[1].fileSize).toBe(10485760);
    });
  });
});
