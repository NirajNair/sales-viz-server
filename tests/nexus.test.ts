import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { Context } from "elysia";
import { validateNexusGraphQuery } from "../src/dto/nexus.dto";
import {
  createHandleGetNexusFilterOptions,
  createHandleGetNexusGraph,
  type NexusDependencies,
} from "../src/handlers/nexus";
import type { AppError } from "../src/lib/errors";

const mockLogger = {
  error: mock(() => {}),
  info: mock(() => {}),
};

function createMockContext(query: Record<string, unknown>): Context {
  return { query } as unknown as Context;
}

// Helper to create a mock DB chain for the graph query with 3 inner joins
function createMockDbChain(data: unknown) {
  return {
    from: mock(() => ({
      innerJoin: mock(() => ({
        innerJoin: mock(() => ({
          innerJoin: mock(() => ({
            where: mock(() => Promise.resolve(data)),
          })),
        })),
      })),
    })),
  };
}

describe("Nexus DTO query validation", () => {
  test("validates required entityIds as comma-separated UUIDs", () => {
    const result = validateNexusGraphQuery({
      entityIds:
        "550e8400-e29b-41d4-a716-446655440000,550e8400-e29b-41d4-a716-446655440001",
    });

    expect(result.entityIds).toHaveLength(2);
    expect(result.entityIds[0]).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(result.entityIds[1]).toBe("550e8400-e29b-41d4-a716-446655440001");
  });

  test("throws when entityIds is empty", () => {
    expect(() =>
      validateNexusGraphQuery({
        entityIds: "",
      }),
    ).toThrow();
  });

  test("throws on invalid entity UUID", () => {
    expect(() =>
      validateNexusGraphQuery({
        entityIds: "invalid-uuid",
      }),
    ).toThrow("Invalid entityIds value");
  });

  test("normalizes hsnCodes as comma-separated code strings", () => {
    const result = validateNexusGraphQuery({
      entityIds: "550e8400-e29b-41d4-a716-446655440000",
      hsnCodes: "2901,2902",
    });

    expect(result.hsnCodes).toHaveLength(2);
    expect(result.hsnCodes[0]).toBe("2901");
    expect(result.hsnCodes[1]).toBe("2902");
  });

  test("defaults to last 6 months when no dates provided", () => {
    const before = new Date();
    const result = validateNexusGraphQuery({
      entityIds: "550e8400-e29b-41d4-a716-446655440000",
    });
    const after = new Date();

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    expect(result.toDate?.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(result.toDate?.getTime()).toBeLessThanOrEqual(after.getTime());
    expect(result.fromDate?.getTime()).toBeGreaterThanOrEqual(
      sixMonthsAgo.getTime() - 1000,
    );
    expect(result.fromDate?.getTime()).toBeLessThanOrEqual(
      sixMonthsAgo.getTime() + 1000,
    );
  });

  test("uses provided fromDate and defaults toDate to now", () => {
    const fromDate = "2025-01-01T00:00:00.000Z";
    const result = validateNexusGraphQuery({
      entityIds: "550e8400-e29b-41d4-a716-446655440000",
      fromDate,
    });

    expect(result.fromDate?.toISOString()).toBe(fromDate);
    expect(result.toDate?.getTime()).toBeGreaterThanOrEqual(
      new Date().getTime() - 1000,
    );
  });

  test("uses provided toDate and defaults fromDate to epoch", () => {
    const toDate = "2025-12-31T00:00:00.000Z";
    const result = validateNexusGraphQuery({
      entityIds: "550e8400-e29b-41d4-a716-446655440000",
      toDate,
    });

    expect(result.toDate?.toISOString()).toBe(toDate);
    expect(result.fromDate?.getTime()).toBe(new Date(0).getTime());
  });

  test("throws on invalid date format", () => {
    expect(() =>
      validateNexusGraphQuery({
        entityIds: "550e8400-e29b-41d4-a716-446655440000",
        fromDate: "invalid-date",
      }),
    ).toThrow("Invalid fromDate. Expected ISO date string");
  });

  test("throws when fromDate is after toDate", () => {
    expect(() =>
      validateNexusGraphQuery({
        entityIds: "550e8400-e29b-41d4-a716-446655440000",
        fromDate: "2026-02-10T00:00:00.000Z",
        toDate: "2026-02-01T00:00:00.000Z",
      }),
    ).toThrow("fromDate cannot be greater than toDate");
  });
});

describe("Get nexus graph handler", () => {
  beforeEach(() => {
    mockLogger.error.mockClear();
    mockLogger.info.mockClear();
  });

  test("returns nodes and links for selected entities", async () => {
    const sellerId = "550e8400-e29b-41d4-a716-446655440001";
    const buyerId = "550e8400-e29b-41d4-a716-446655440002";

    const dbRecords = [
      {
        sellerId: sellerId,
        sellerName: "Seller Corp",
        sellerGstin: "22AAAAA0000A1Z5",
        sellerIsBuyer: false,
        sellerIsSeller: true,
        buyerId: buyerId,
        buyerName: "Buyer Corp",
        buyerGstin: "33BBBBB0000B1Z5",
        buyerIsBuyer: true,
        buyerIsSeller: false,
        hsnCode: "2901",
        chemicalName: "Methanol",
      },
    ];

    const mockDb = {
      select: mock(() => createMockDbChain(dbRecords)),
    };

    const handleGetNexusGraph = createHandleGetNexusGraph({
      db: mockDb as unknown as NexusDependencies["db"],
      loggerWithContext: mockLogger,
    });

    const result = await handleGetNexusGraph(
      createMockContext({ entityIds: sellerId }),
    );

    expect(result.nodes).toHaveLength(2);
    expect(result.links).toHaveLength(1);
    expect(result.links[0].hsnDetails).toHaveLength(1);
    expect(mockLogger.info).toHaveBeenCalled();
  });

  test("marks selected entities correctly", async () => {
    const selectedId = "550e8400-e29b-41d4-a716-446655440001";
    const connectedId = "550e8400-e29b-41d4-a716-446655440002";

    const dbRecords = [
      {
        sellerId: selectedId,
        sellerName: "Selected Entity",
        sellerGstin: "22AAAAA0000A1Z5",
        sellerIsBuyer: true,
        sellerIsSeller: true,
        buyerId: connectedId,
        buyerName: "Connected Entity",
        buyerGstin: "33BBBBB0000B1Z5",
        buyerIsBuyer: true,
        buyerIsSeller: false,
        hsnCode: "2901",
        chemicalName: "Methanol",
      },
    ];

    const mockDb = {
      select: mock(() => createMockDbChain(dbRecords)),
    };

    const handleGetNexusGraph = createHandleGetNexusGraph({
      db: mockDb as unknown as NexusDependencies["db"],
      loggerWithContext: mockLogger,
    });

    const result = await handleGetNexusGraph(
      createMockContext({ entityIds: selectedId }),
    );

    const selectedNode = result.nodes.find((n) => n.id === selectedId);
    const connectedNode = result.nodes.find((n) => n.id === connectedId);

    expect(selectedNode?.isSelected).toBe(true);
    expect(connectedNode?.isSelected).toBe(false);
  });

  test("groups HSN details per link", async () => {
    const sellerId = "550e8400-e29b-41d4-a716-446655440001";
    const buyerId = "550e8400-e29b-41d4-a716-446655440002";

    const dbRecords = [
      {
        sellerId: sellerId,
        sellerName: "Seller Corp",
        sellerGstin: "22AAAAA0000A1Z5",
        sellerIsBuyer: false,
        sellerIsSeller: true,
        buyerId: buyerId,
        buyerName: "Buyer Corp",
        buyerGstin: "33BBBBB0000B1Z5",
        buyerIsBuyer: true,
        buyerIsSeller: false,
        hsnCode: "2901",
        chemicalName: "Methanol",
      },
      {
        sellerId: sellerId,
        sellerName: "Seller Corp",
        sellerGstin: "22AAAAA0000A1Z5",
        sellerIsBuyer: false,
        sellerIsSeller: true,
        buyerId: buyerId,
        buyerName: "Buyer Corp",
        buyerGstin: "33BBBBB0000B1Z5",
        buyerIsBuyer: true,
        buyerIsSeller: false,
        hsnCode: "2902",
        chemicalName: "Ethanol",
      },
    ];

    const mockDb = {
      select: mock(() => createMockDbChain(dbRecords)),
    };

    const handleGetNexusGraph = createHandleGetNexusGraph({
      db: mockDb as unknown as NexusDependencies["db"],
      loggerWithContext: mockLogger,
    });

    const result = await handleGetNexusGraph(
      createMockContext({ entityIds: sellerId }),
    );

    expect(result.links).toHaveLength(1);
    expect(result.links[0].hsnDetails).toHaveLength(2);
    expect(result.links[0].hsnDetails.map((h) => h.code)).toContain("2901");
    expect(result.links[0].hsnDetails.map((h) => h.code)).toContain("2902");
  });

  test("filters by HSN codes when provided", async () => {
    const sellerId = "550e8400-e29b-41d4-a716-446655440001";

    const mockDb = {
      select: mock(() => createMockDbChain([])),
    };

    const handleGetNexusGraph = createHandleGetNexusGraph({
      db: mockDb as unknown as NexusDependencies["db"],
      loggerWithContext: mockLogger,
    });

    await handleGetNexusGraph(
      createMockContext({
        entityIds: sellerId,
        hsnCodes: "2901,2902",
      }),
    );

    expect(mockDb.select).toHaveBeenCalled();
  });

  test("throws validation error for invalid input", async () => {
    const mockDb = {
      select: mock(() => ({})),
    };

    const handleGetNexusGraph = createHandleGetNexusGraph({
      db: mockDb as unknown as NexusDependencies["db"],
      loggerWithContext: mockLogger,
    });

    try {
      await handleGetNexusGraph(
        createMockContext({ entityIds: "invalid-uuid" }),
      );
      throw new Error("Expected validation error");
    } catch (error) {
      expect((error as Error).message).toContain("Invalid entityIds value");
      const appError = error as AppError;
      expect(appError.statusCode).toBe(400);
    }
  });

  test("handles empty graph results gracefully", async () => {
    const sellerId = "550e8400-e29b-41d4-a716-446655440001";

    const mockDb = {
      select: mock(() => createMockDbChain([])),
    };

    const handleGetNexusGraph = createHandleGetNexusGraph({
      db: mockDb as unknown as NexusDependencies["db"],
      loggerWithContext: mockLogger,
    });

    const result = await handleGetNexusGraph(
      createMockContext({ entityIds: sellerId }),
    );

    expect(result.nodes).toHaveLength(0);
    expect(result.links).toHaveLength(0);
  });
});

describe("Get nexus filter options handler", () => {
  beforeEach(() => {
    mockLogger.error.mockClear();
    mockLogger.info.mockClear();
  });

  test("returns entities and HSN codes", async () => {
    const entityRows = [
      { id: "e1", name: "Entity A", gstin: "22AAAAA0000A1Z5" },
      { id: "e2", name: "Entity B", gstin: "33BBBBB0000B1Z5" },
    ];

    const hsnRows = [
      { id: "h1", code: "2901", chemicalName: "Methanol" },
      { id: "h2", code: "2902", chemicalName: "Ethanol" },
    ];

    const createSelectChain = (data: unknown) => ({
      from: mock(() => ({
        orderBy: mock(() => Promise.resolve(data)),
      })),
    });

    const createSelectDistinctOnChain = (data: unknown) => ({
      from: mock(() => ({
        where: mock(() => ({
          orderBy: mock(() => Promise.resolve(data)),
        })),
      })),
    });

    const mockDb = {
      select: mock(() => createSelectChain(entityRows)),
      selectDistinctOn: mock(() => createSelectDistinctOnChain(hsnRows)),
    };

    const handleGetNexusFilterOptions = createHandleGetNexusFilterOptions({
      db: mockDb as unknown as NexusDependencies["db"],
      loggerWithContext: mockLogger,
    });

    const result = await handleGetNexusFilterOptions();

    expect(result.entities).toHaveLength(2);
    expect(result.hsnCodes).toHaveLength(2);
    expect(result.entities[0].name).toBe("Entity A");
    expect(result.hsnCodes[0].code).toBe("2901");
  });

  test("returns empty arrays when no data", async () => {
    const emptyChain = {
      from: mock(() => ({
        orderBy: mock(() => Promise.resolve([])),
      })),
    };
    const emptyDistinctChain = {
      from: mock(() => ({
        where: mock(() => ({
          orderBy: mock(() => Promise.resolve([])),
        })),
      })),
    };

    const mockDb = {
      select: mock(() => emptyChain),
      selectDistinctOn: mock(() => emptyDistinctChain),
    };

    const handleGetNexusFilterOptions = createHandleGetNexusFilterOptions({
      db: mockDb as unknown as NexusDependencies["db"],
      loggerWithContext: mockLogger,
    });

    const result = await handleGetNexusFilterOptions();

    expect(result.entities).toHaveLength(0);
    expect(result.hsnCodes).toHaveLength(0);
  });
});
