import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  lte,
  ne,
  type SQL,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Context } from "elysia";
import { db } from "../db";
import { entities, hsnCodes, purchaseRecords } from "../db/schema";
import type {
  FilterOptionsResponse,
  GetPurchaseRecordsResponse,
  PurchaseRecord,
  ValidatedPurchaseRecordsQuery,
} from "../dto/purchase-records.dto";
import { validatePurchaseRecordsQuery } from "../dto/purchase-records.dto";
import { PurchaseRecordSortField } from "../enums/purchase-record-sort-field.enum";
import { SortOrder } from "../enums/sort-order.enum";
import { loggerWithContext } from "../lib/logger";
import { buildCsv } from "../lib/utils";

export type PurchaseRecordsDependencies = {
  db: typeof db;
  loggerWithContext: Pick<typeof loggerWithContext, "info" | "error">;
};

const sellerEntity = alias(entities, "seller_entity");
const buyerEntity = alias(entities, "buyer_entity");

function getFilterConditions(
  query: ValidatedPurchaseRecordsQuery,
): SQL<unknown>[] {
  const conditions: SQL<unknown>[] = [];

  if (query.sellerIds.length > 0) {
    conditions.push(inArray(purchaseRecords.sellerEntityId, query.sellerIds));
  }

  if (query.buyerIds.length > 0) {
    conditions.push(inArray(purchaseRecords.buyerEntityId, query.buyerIds));
  }

  if (query.hsnCodes.length > 0) {
    conditions.push(inArray(hsnCodes.code, query.hsnCodes));
  }

  if (query.chemicalNames.length > 0) {
    conditions.push(inArray(hsnCodes.chemicalName, query.chemicalNames));
  }

  if (query.fromDate) {
    conditions.push(gte(purchaseRecords.invoiceDate, query.fromDate));
  }

  if (query.toDate) {
    conditions.push(lte(purchaseRecords.invoiceDate, query.toDate));
  }

  return conditions;
}

function buildOrderBy(
  sortField: PurchaseRecordSortField,
  sortOrder: SortOrder,
) {
  const sortColumnByField = {
    [PurchaseRecordSortField.InvoiceDate]: purchaseRecords.invoiceDate,
    [PurchaseRecordSortField.AssessValue]: purchaseRecords.assessVal,
    [PurchaseRecordSortField.SellerName]: sellerEntity.name,
    [PurchaseRecordSortField.BuyerName]: buyerEntity.name,
    [PurchaseRecordSortField.HsnCode]: hsnCodes.code,
    [PurchaseRecordSortField.ChemicalName]: hsnCodes.chemicalName,
  } as const;

  const sortColumn = sortColumnByField[sortField];
  return sortOrder === SortOrder.Asc ? asc(sortColumn) : desc(sortColumn);
}

function mapRowToPurchaseRecord(row: {
  id: string;
  sellerName: string | null;
  sellerGstin: string | null;
  buyerName: string | null;
  buyerGstin: string | null;
  assessValue: string | null;
  invoiceDate: Date | null;
  hsnCode: string | null;
  chemicalName: string | null;
}): PurchaseRecord {
  return {
    id: row.id,
    sellerName: row.sellerName ?? "",
    sellerGstin: row.sellerGstin ?? "",
    buyerName: row.buyerName ?? "",
    buyerGstin: row.buyerGstin ?? "",
    assessValue: row.assessValue ? Number(row.assessValue) : 0,
    invoiceDate: row.invoiceDate ? row.invoiceDate.toISOString() : "",
    hsnCode: row.hsnCode ?? "",
    chemicalName: row.chemicalName ?? "",
  };
}

async function fetchPurchaseRecordRows(
  deps: PurchaseRecordsDependencies,
  query: ValidatedPurchaseRecordsQuery,
  whereCondition: SQL<unknown> | undefined,
  options: { applyPagination?: boolean } = { applyPagination: false },
) {
  const orderByClause = buildOrderBy(query.sortField, query.sortOrder);
  const offset = (query.page - 1) * query.pageSize;

  const baseQuery = deps.db
    .select({
      id: purchaseRecords.id,
      sellerName: sellerEntity.name,
      sellerGstin: sellerEntity.gstin,
      buyerName: buyerEntity.name,
      buyerGstin: buyerEntity.gstin,
      assessValue: purchaseRecords.assessVal,
      invoiceDate: purchaseRecords.invoiceDate,
      hsnCode: hsnCodes.code,
      chemicalName: hsnCodes.chemicalName,
    })
    .from(purchaseRecords)
    .leftJoin(sellerEntity, eq(purchaseRecords.sellerEntityId, sellerEntity.id))
    .leftJoin(buyerEntity, eq(purchaseRecords.buyerEntityId, buyerEntity.id))
    .leftJoin(hsnCodes, eq(purchaseRecords.hsnCodeId, hsnCodes.id))
    .where(whereCondition)
    .orderBy(orderByClause);

  if (options.applyPagination) {
    return baseQuery.limit(query.pageSize).offset(offset);
  }

  return baseQuery;
}

export function createHandleGetPurchaseRecords(
  deps: PurchaseRecordsDependencies,
) {
  return async function handleGetPurchaseRecords({
    query,
  }: Context): Promise<GetPurchaseRecordsResponse> {
    const validatedQuery = validatePurchaseRecordsQuery(
      query as Record<string, unknown>,
    );
    const whereCondition = and(...getFilterConditions(validatedQuery));

    const [totalResult] = await deps.db
      .select({ total: count() })
      .from(purchaseRecords)
      .leftJoin(hsnCodes, eq(purchaseRecords.hsnCodeId, hsnCodes.id))
      .where(whereCondition);

    const rows = await fetchPurchaseRecordRows(
      deps,
      validatedQuery,
      whereCondition,
      { applyPagination: true },
    );

    const total = Number(totalResult?.total ?? 0);
    const totalPages =
      total === 0 ? 0 : Math.ceil(total / validatedQuery.pageSize);

    deps.loggerWithContext.info(
      {
        total,
        page: validatedQuery.page,
        pageSize: validatedQuery.pageSize,
      },
      "Purchase records fetched successfully",
    );

    return {
      records: rows.map((row) => mapRowToPurchaseRecord(row)),
      pagination: {
        total,
        page: validatedQuery.page,
        pageSize: validatedQuery.pageSize,
        totalPages,
      },
    };
  };
}

export const handleGetPurchaseRecords = createHandleGetPurchaseRecords({
  db,
  loggerWithContext,
});

export function createHandleGetPurchaseRecordFilterOptions(
  deps: PurchaseRecordsDependencies,
) {
  return async function handleGetPurchaseRecordFilterOptions(): Promise<FilterOptionsResponse> {
    const [sellers, buyers, hsnCodeRows, hsnChemicalMappings] =
      await Promise.all([
        deps.db
          .select({
            id: entities.id,
            name: entities.name,
            gstin: entities.gstin,
          })
          .from(entities)
          .where(eq(entities.isSeller, true))
          .orderBy(asc(entities.name)),
        deps.db
          .select({
            id: entities.id,
            name: entities.name,
            gstin: entities.gstin,
          })
          .from(entities)
          .where(eq(entities.isBuyer, true))
          .orderBy(asc(entities.name)),
        deps.db
          .selectDistinctOn([hsnCodes.code], {
            code: hsnCodes.code,
          })
          .from(hsnCodes)
          .where(
            and(isNotNull(hsnCodes.code), ne(hsnCodes.code, "")),
          )
          .orderBy(asc(hsnCodes.code)),
        deps.db
          .select({
            hsnCode: hsnCodes.code,
            chemicalName: hsnCodes.chemicalName,
          })
          .from(hsnCodes)
          .orderBy(asc(hsnCodes.code), asc(hsnCodes.chemicalName)),
      ]);

    return {
      sellers,
      buyers,
      hsnCodes: hsnCodeRows,
      hsnChemicalMappings,
    };
  };
}

export const handleGetPurchaseRecordFilterOptions =
  createHandleGetPurchaseRecordFilterOptions({
    db,
    loggerWithContext,
  });

export function createHandleExportPurchaseRecords(
  deps: PurchaseRecordsDependencies,
) {
  return async function handleExportPurchaseRecords({ query }: Context) {
    const validatedQuery = validatePurchaseRecordsQuery(
      query as Record<string, unknown>,
    );
    const whereCondition = and(...getFilterConditions(validatedQuery));
    const rows = await fetchPurchaseRecordRows(
      deps,
      validatedQuery,
      whereCondition,
    );
    const records = rows.map((row) => mapRowToPurchaseRecord(row));

    const headers = [
      "Seller Name",
      "Seller GSTIN",
      "Buyer Name",
      "Buyer GSTIN",
      "Assess Value",
      "Invoice Date",
      "HSN Code",
      "Chemical Name",
    ];

    const csvRows = records.map((record) => [
      record.sellerName,
      record.sellerGstin,
      record.buyerName,
      record.buyerGstin,
      record.assessValue,
      record.invoiceDate,
      record.hsnCode,
      record.chemicalName,
    ]);

    const csvContent = buildCsv(headers, csvRows);

    return new Response(csvContent, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="purchase-records.csv"',
      },
    });
  };
}

export const handleExportPurchaseRecords = createHandleExportPurchaseRecords({
  db,
  loggerWithContext,
});
