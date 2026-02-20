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

// Helper to create a mock DB that handles two sequential queries (connected + adjacent)
function createMockDbWithTwoQueries(firstQueryData: unknown, secondQueryData: unknown) {
  let callCount = 0;
  return {
    select: mock(() => {
      callCount++;
      if (callCount === 1) {
        return createMockDbChain(firstQueryData);
      }
      return createMockDbChain(secondQueryData);
    }),
  };
}

describe("Nexus DTO query validation", () => {
  test("validates required entityIds as comma-separated UUIDs", () => {
    const result = validateNexusGraphQuery({
      entityIds:
        "550e8400-e29b-41d4-a716-446655440000,550e8400-e29b-41d4-a716-446655440001",
      fromDate: "2025-01-01T00:00:00.000Z",
      toDate: "2025-12-31T00:00:00.000Z",
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
      fromDate: "2025-01-01T00:00:00.000Z",
      toDate: "2025-12-31T00:00:00.000Z",
    });

    expect(result.hsnCodes).toHaveLength(2);
    expect(result.hsnCodes[0]).toBe("2901");
    expect(result.hsnCodes[1]).toBe("2902");
  });

  test("throws when date range is not provided", () => {
    expect(() =>
      validateNexusGraphQuery({
        entityIds: "550e8400-e29b-41d4-a716-446655440000",
      }),
    ).toThrow("Date range is required");
  });

  test("throws when only fromDate is provided", () => {
    expect(() =>
      validateNexusGraphQuery({
        entityIds: "550e8400-e29b-41d4-a716-446655440000",
        fromDate: "2025-01-01T00:00:00.000Z",
      }),
    ).toThrow("Date range is required");
  });

  test("throws when only toDate is provided", () => {
    expect(() =>
      validateNexusGraphQuery({
        entityIds: "550e8400-e29b-41d4-a716-446655440000",
        toDate: "2025-12-31T00:00:00.000Z",
      }),
    ).toThrow("Date range is required");
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
    ).toThrow("Start date cannot be greater than end date");
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
        buyerId: buyerId,
        buyerName: "Buyer Corp",
        buyerGstin: "33BBBBB0000B1Z5",
        hsnCode: "2901",
        chemicalName: "Methanol",
      },
    ];

    const mockDb = createMockDbWithTwoQueries(dbRecords, dbRecords);

    const handleGetNexusGraph = createHandleGetNexusGraph({
      db: mockDb as unknown as NexusDependencies["db"],
      loggerWithContext: mockLogger,
    });

    const result = await handleGetNexusGraph(
      createMockContext({
        entityIds: sellerId,
        fromDate: "2025-01-01T00:00:00.000Z",
        toDate: "2025-12-31T00:00:00.000Z",
      }),
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
        buyerId: connectedId,
        buyerName: "Connected Entity",
        buyerGstin: "33BBBBB0000B1Z5",
        hsnCode: "2901",
        chemicalName: "Methanol",
      },
    ];

    const mockDb = createMockDbWithTwoQueries(dbRecords, dbRecords);

    const handleGetNexusGraph = createHandleGetNexusGraph({
      db: mockDb as unknown as NexusDependencies["db"],
      loggerWithContext: mockLogger,
    });

    const result = await handleGetNexusGraph(
      createMockContext({
        entityIds: selectedId,
        fromDate: "2025-01-01T00:00:00.000Z",
        toDate: "2025-12-31T00:00:00.000Z",
      }),
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
        buyerId: buyerId,
        buyerName: "Buyer Corp",
        buyerGstin: "33BBBBB0000B1Z5",
        hsnCode: "2901",
        chemicalName: "Methanol",
      },
      {
        sellerId: sellerId,
        sellerName: "Seller Corp",
        sellerGstin: "22AAAAA0000A1Z5",
        buyerId: buyerId,
        buyerName: "Buyer Corp",
        buyerGstin: "33BBBBB0000B1Z5",
        hsnCode: "2902",
        chemicalName: "Ethanol",
      },
    ];

    const mockDb = createMockDbWithTwoQueries(dbRecords, dbRecords);

    const handleGetNexusGraph = createHandleGetNexusGraph({
      db: mockDb as unknown as NexusDependencies["db"],
      loggerWithContext: mockLogger,
    });

    const result = await handleGetNexusGraph(
      createMockContext({
        entityIds: sellerId,
        fromDate: "2025-01-01T00:00:00.000Z",
        toDate: "2025-12-31T00:00:00.000Z",
      }),
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
        fromDate: "2025-01-01T00:00:00.000Z",
        toDate: "2025-12-31T00:00:00.000Z",
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

    const mockDb = createMockDbWithTwoQueries([], []);

    const handleGetNexusGraph = createHandleGetNexusGraph({
      db: mockDb as unknown as NexusDependencies["db"],
      loggerWithContext: mockLogger,
    });

    const result = await handleGetNexusGraph(
      createMockContext({
        entityIds: sellerId,
        fromDate: "2025-01-01T00:00:00.000Z",
        toDate: "2025-12-31T00:00:00.000Z",
      }),
    );

    expect(result.nodes).toHaveLength(0);
    expect(result.links).toHaveLength(0);
  });

  test("handles multiple selected entities and includes all adjacent nodes", async () => {
    const entityA = "550e8400-e29b-41d4-a716-446655440001";
    const entityB = "550e8400-e29b-41d4-a716-446655440002";
    const entityC = "550e8400-e29b-41d4-a716-446655440003";
    const entityD = "550e8400-e29b-41d4-a716-446655440004";

    // First query returns records connected to A or B
    const firstQueryRecords = [
      // A sells to C
      {
        sellerId: entityA,
        sellerName: "Entity A",
        sellerGstin: "22AAAAA0000A1Z5",
        buyerId: entityC,
        buyerName: "Entity C",
        buyerGstin: "33CCCCC0000C1Z5",
        hsnCode: "2901",
        chemicalName: "Methanol",
      },
      // B sells to D
      {
        sellerId: entityB,
        sellerName: "Entity B",
        sellerGstin: "44BBBBB0000B1Z5",
        buyerId: entityD,
        buyerName: "Entity D",
        buyerGstin: "55DDDDD0000D1Z5",
        hsnCode: "2902",
        chemicalName: "Ethanol",
      },
    ];

    // Second query returns all records between connected entities (A, B, C, D)
    const secondQueryRecords = [
      ...firstQueryRecords,
      // Additional connection between C and D (both are now in the connected set)
      {
        sellerId: entityC,
        sellerName: "Entity C",
        sellerGstin: "33CCCCC0000C1Z5",
        buyerId: entityD,
        buyerName: "Entity D",
        buyerGstin: "55DDDDD0000D1Z5",
        hsnCode: "2903",
        chemicalName: "Propanol",
      },
    ];

    const mockDb = createMockDbWithTwoQueries(firstQueryRecords, secondQueryRecords);

    const handleGetNexusGraph = createHandleGetNexusGraph({
      db: mockDb as unknown as NexusDependencies["db"],
      loggerWithContext: mockLogger,
    });

    const result = await handleGetNexusGraph(
      createMockContext({
        entityIds: `${entityA},${entityB}`,
        fromDate: "2025-01-01T00:00:00.000Z",
        toDate: "2025-12-31T00:00:00.000Z",
      }),
    );

    // Should have all 4 nodes
    expect(result.nodes).toHaveLength(4);
    expect(result.nodes.map((n) => n.id)).toContain(entityA);
    expect(result.nodes.map((n) => n.id)).toContain(entityB);
    expect(result.nodes.map((n) => n.id)).toContain(entityC);
    expect(result.nodes.map((n) => n.id)).toContain(entityD);

    // Should have 2 links (A->C and B->D)
    expect(result.links).toHaveLength(2);

    // Check that selected entities are marked correctly
    const nodeA = result.nodes.find((n) => n.id === entityA);
    const nodeB = result.nodes.find((n) => n.id === entityB);
    const nodeC = result.nodes.find((n) => n.id === entityC);
    const nodeD = result.nodes.find((n) => n.id === entityD);

    expect(nodeA?.isSelected).toBe(true);
    expect(nodeB?.isSelected).toBe(true);
    expect(nodeC?.isSelected).toBe(false);
    expect(nodeD?.isSelected).toBe(false);
  });

  test("computes buyer/seller roles based on filtered records only", async () => {
    const entityA = "550e8400-e29b-41d4-a716-446655440001";
    const entityB = "550e8400-e29b-41d4-a716-446655440002";
    const entityC = "550e8400-e29b-41d4-a716-446655440003";

    // In these records: A is only a seller, B is both buyer and seller, C is only a buyer
    const dbRecords = [
      // A sells to B
      {
        sellerId: entityA,
        sellerName: "Entity A",
        sellerGstin: "22AAAAA0000A1Z5",
        buyerId: entityB,
        buyerName: "Entity B",
        buyerGstin: "33BBBBB0000B1Z5",
        hsnCode: "2901",
        chemicalName: "Methanol",
      },
      // B sells to C
      {
        sellerId: entityB,
        sellerName: "Entity B",
        sellerGstin: "33BBBBB0000B1Z5",
        buyerId: entityC,
        buyerName: "Entity C",
        buyerGstin: "44CCCCC0000C1Z5",
        hsnCode: "2902",
        chemicalName: "Ethanol",
      },
    ];

    const mockDb = createMockDbWithTwoQueries(dbRecords, dbRecords);

    const handleGetNexusGraph = createHandleGetNexusGraph({
      db: mockDb as unknown as NexusDependencies["db"],
      loggerWithContext: mockLogger,
    });

    const result = await handleGetNexusGraph(
      createMockContext({
        entityIds: entityA,
        fromDate: "2025-01-01T00:00:00.000Z",
        toDate: "2025-12-31T00:00:00.000Z",
      }),
    );

    const nodeA = result.nodes.find((n) => n.id === entityA);
    const nodeB = result.nodes.find((n) => n.id === entityB);
    const nodeC = result.nodes.find((n) => n.id === entityC);

    // A only appears as seller in these records
    expect(nodeA?.isSeller).toBe(true);
    expect(nodeA?.isBuyer).toBe(false);

    // B appears as both seller (sells to C) and buyer (buys from A)
    expect(nodeB?.isSeller).toBe(true);
    expect(nodeB?.isBuyer).toBe(true);

    // C only appears as buyer in these records
    expect(nodeC?.isSeller).toBe(false);
    expect(nodeC?.isBuyer).toBe(true);
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
