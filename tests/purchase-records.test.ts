import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { Context } from "elysia";
import { validatePurchaseRecordsQuery } from "../src/dto/purchase-records.dto";
import { PurchaseRecordSortField } from "../src/enums/purchase-record-sort-field.enum";
import { SortOrder } from "../src/enums/sort-order.enum";
import {
  createHandleExportPurchaseRecords,
  createHandleGetPurchaseRecordFilterOptions,
  createHandleGetPurchaseRecords,
  type PurchaseRecordsDependencies,
} from "../src/handlers/purchase-records";
import type { AppError } from "../src/lib/errors";
import { buildCsv } from "../src/lib/utils";

const mockLogger = {
  error: mock(() => {}),
  info: mock(() => {}),
};

function createMockContext(query: Record<string, unknown>): Context {
  return { query } as unknown as Context;
}

describe("Purchase records DTO query validation", () => {
  test("normalizes comma-separated and repeated query values", () => {
    const result = validatePurchaseRecordsQuery({
      sellerIds: [
        "550e8400-e29b-41d4-a716-446655440000,550e8400-e29b-41d4-a716-446655440001",
      ],
      buyerIds: "550e8400-e29b-41d4-a716-446655440002",
      hsnCodes: "2901,2902",
      chemicalNames: "A,B",
      page: "2",
      pageSize: "10",
      sortField: PurchaseRecordSortField.AssessValue,
      sortOrder: SortOrder.Asc,
    });

    expect(result.sellerIds).toHaveLength(2);
    expect(result.buyerIds).toEqual(["550e8400-e29b-41d4-a716-446655440002"]);
    expect(result.hsnCodes).toEqual(["2901", "2902"]);
    expect(result.chemicalNames).toEqual(["A", "B"]);
    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(10);
    expect(result.sortField).toBe(PurchaseRecordSortField.AssessValue);
    expect(result.sortOrder).toBe(SortOrder.Asc);
  });

  test("throws on invalid date range", () => {
    expect(() =>
      validatePurchaseRecordsQuery({
        fromDate: "2026-02-10T00:00:00.000Z",
        toDate: "2026-02-01T00:00:00.000Z",
      }),
    ).toThrow("fromDate cannot be greater than toDate");
  });

  test("throws on invalid seller UUID", () => {
    expect(() =>
      validatePurchaseRecordsQuery({
        sellerIds: "invalid-id",
      }),
    ).toThrow("Invalid sellerIds value");
  });
});

describe("Purchase records CSV utility", () => {
  test("escapes comma, quotes and new lines via @json2csv/plainjs", () => {
    const csv = buildCsv(["name", "note"], [["ACME, Inc", 'line "1"\nline2']]);
    expect(csv).toContain("ACME, Inc");
    expect(csv).toContain('line ""1""');
    expect(csv).toContain("line2");
    expect(csv.split("\n").length).toBeGreaterThanOrEqual(2);
  });
});

describe("Get purchase records handler", () => {
  let mockDb: any;
  let handleGetPurchaseRecords: ReturnType<
    typeof createHandleGetPurchaseRecords
  >;

  beforeEach(() => {
    mockLogger.error.mockClear();
    mockLogger.info.mockClear();
  });

  test("returns paginated records", async () => {
    const countChain: any = {
      from: mock(() => countChain),
      leftJoin: mock(() => countChain),
      where: mock(() => Promise.resolve([{ total: 2 }])),
    };

    const rows = [
      {
        id: "rec-1",
        sellerName: "Seller A",
        sellerGstin: "22AAAAA0000A1Z5",
        buyerName: "Buyer A",
        buyerGstin: "33BBBBB0000B1Z5",
        assessValue: "123.45",
        invoiceDate: new Date("2026-02-01T00:00:00.000Z"),
        hsnCode: "2901",
        chemicalName: "Methanol",
      },
    ];

    const dataChain: any = {
      from: mock(() => dataChain),
      leftJoin: mock(() => dataChain),
      where: mock(() => dataChain),
      orderBy: mock(() => dataChain),
      limit: mock(() => dataChain),
      offset: mock(() => Promise.resolve(rows)),
    };

    mockDb = {
      select: mock((selection: unknown) => {
        if (
          selection &&
          typeof selection === "object" &&
          "total" in (selection as Record<string, unknown>)
        ) {
          return countChain;
        }
        return dataChain;
      }),
    };

    handleGetPurchaseRecords = createHandleGetPurchaseRecords({
      db: mockDb as unknown as PurchaseRecordsDependencies["db"],
      loggerWithContext: mockLogger,
    });

    const result = await handleGetPurchaseRecords(
      createMockContext({ page: "1", pageSize: "20" }),
    );

    expect(result.records).toHaveLength(1);
    expect(result.records[0].assessValue).toBe(123.45);
    expect(result.records[0].invoiceDate).toBe("2026-02-01T00:00:00.000Z");
    expect(result.pagination.total).toBe(2);
    expect(result.pagination.page).toBe(1);
    expect(result.pagination.pageSize).toBe(20);
    expect(result.pagination.totalPages).toBe(1);
    expect(mockLogger.info).toHaveBeenCalled();
  });

  test("throws validation error for invalid sort order", async () => {
    mockDb = { select: mock(() => ({})) };
    handleGetPurchaseRecords = createHandleGetPurchaseRecords({
      db: mockDb as unknown as PurchaseRecordsDependencies["db"],
      loggerWithContext: mockLogger,
    });

    try {
      await handleGetPurchaseRecords(
        createMockContext({ sortOrder: "up" as unknown }),
      );
      throw new Error("Expected validation error");
    } catch (error) {
      expect((error as Error).message).toContain("Invalid option");
      const appError = error as AppError;
      expect(appError.statusCode).toBe(400);
    }
  });
});

describe("Get purchase record filter options handler", () => {
  test("returns sellers, buyers, hsn codes and mappings", async () => {
    const responses = [
      [{ id: "s1", name: "Seller A", gstin: "22AAAAA0000A1Z5" }],
      [{ id: "b1", name: "Buyer A", gstin: "33BBBBB0000B1Z5" }],
      [{ code: "2901" }],
      [{ hsnCode: "2901", chemicalName: "Methanol" }],
    ];
    let callIndex = 0;

    const createChain = (data: unknown) => {
      const chain: any = {
        from: mock(() => chain),
        where: mock(() => chain),
        orderBy: mock(() => Promise.resolve(data)),
      };
      return chain;
    };

    const mockDb = {
      select: mock(() => {
        const data = responses[callIndex++];
        return createChain(data);
      }),
      selectDistinctOn: mock(() => {
        const data = responses[callIndex++];
        return createChain(data);
      }),
    };

    const handleGetPurchaseRecordFilterOptions =
      createHandleGetPurchaseRecordFilterOptions({
        db: mockDb as unknown as PurchaseRecordsDependencies["db"],
        loggerWithContext: mockLogger,
      });

    const result = await handleGetPurchaseRecordFilterOptions();

    expect(result.sellers).toHaveLength(1);
    expect(result.buyers).toHaveLength(1);
    expect(result.hsnCodes).toHaveLength(1);
    expect(result.hsnChemicalMappings).toHaveLength(1);
  });
});

describe("Export purchase records handler", () => {
  test("returns CSV response with attachment headers", async () => {
    const rows = [
      {
        id: "rec-1",
        sellerName: "Seller A",
        sellerGstin: "22AAAAA0000A1Z5",
        buyerName: "Buyer A",
        buyerGstin: "33BBBBB0000B1Z5",
        assessValue: "10.5",
        invoiceDate: new Date("2026-02-01T00:00:00.000Z"),
        hsnCode: "2901",
        chemicalName: "Methanol",
      },
    ];

    const dataChain: any = {
      from: mock(() => dataChain),
      leftJoin: mock(() => dataChain),
      where: mock(() => dataChain),
      orderBy: mock(() => Promise.resolve(rows)),
      limit: mock(() => dataChain),
      offset: mock(() => Promise.resolve(rows)),
    };

    const mockDb = {
      select: mock(() => dataChain),
    };

    const handleExportPurchaseRecords = createHandleExportPurchaseRecords({
      db: mockDb as unknown as PurchaseRecordsDependencies["db"],
      loggerWithContext: mockLogger,
    });

    const response = await handleExportPurchaseRecords(createMockContext({}));
    const csv = await response.text();

    expect(response.headers.get("content-type")).toContain("text/csv");
    expect(response.headers.get("content-disposition")).toContain(
      'attachment; filename="purchase-records.csv"',
    );
    expect(csv).toContain("Seller Name");
    expect(csv).toContain("Seller A");
    expect(csv).toContain("Buyer A");
    expect(csv).toContain("22AAAAA0000A1Z5");
    expect(csv).toContain("2026-02-01T00:00:00.000Z");
  });
});
