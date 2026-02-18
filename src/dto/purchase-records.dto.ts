import { z } from "zod";
import { PurchaseRecordSortField } from "../enums/purchase-record-sort-field.enum";
import { SortOrder } from "../enums/sort-order.enum";
import { ValidationError } from "../lib/errors";
import { validateWithZod } from "../lib/validation";

export interface Entity {
  id: string;
  name: string;
  gstin: string;
}

export interface HsnCode {
  code: string;
}

export interface HsnChemicalMapping {
  hsnCode: string;
  chemicalName: string;
}

export interface PurchaseRecord {
  id: string;
  sellerName: string;
  sellerGstin: string;
  buyerName: string;
  buyerGstin: string;
  assessValue: number;
  invoiceDate: string;
  hsnCode: string;
  chemicalName: string;
}

export interface GetPurchaseRecordsResponse {
  records: PurchaseRecord[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

export interface FilterOptionsResponse {
  sellers: Entity[];
  buyers: Entity[];
  hsnCodes: HsnCode[];
  hsnChemicalMappings: HsnChemicalMapping[];
}

export interface PurchaseRecordsQueryState {
  sellers: string[];
  buyers: string[];
  hsnCodes: string[];
  chemicalNames: string[];
  fromDate: string | null;
  toDate: string | null;
  page: number;
  pageSize: number;
  sortField: PurchaseRecordSortField;
  sortOrder: SortOrder;
}

export interface ValidatedPurchaseRecordsQuery {
  sellerIds: string[];
  buyerIds: string[];
  hsnCodes: string[];
  chemicalNames: string[];
  fromDate: Date | null;
  toDate: Date | null;
  page: number;
  pageSize: number;
  sortField: PurchaseRecordSortField;
  sortOrder: SortOrder;
}

const querySchema = z.object({
  sellerIds: z.array(z.uuid({ message: "Invalid sellerIds value" })),
  buyerIds: z.array(z.uuid({ message: "Invalid buyerIds value" })),
  hsnCodes: z.array(z.string().min(1)).default([]),
  chemicalNames: z.array(z.string().min(1)).default([]),
  fromDate: z.string().nullable(),
  toDate: z.string().nullable(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sortField: z
    .nativeEnum(PurchaseRecordSortField)
    .default(PurchaseRecordSortField.InvoiceDate),
  sortOrder: z.nativeEnum(SortOrder).default(SortOrder.Desc),
});

type RawPurchaseRecordsQuery = {
  sellerIds: string[];
  buyerIds: string[];
  hsnCodes: string[];
  chemicalNames: string[];
  fromDate: string | null;
  toDate: string | null;
  page?: string | number;
  pageSize?: string | number;
  sortField?: string;
  sortOrder?: string;
};

function normalizeArrayQueryValue(value: unknown): string[] {
  if (value === undefined || value === null || value === "") {
    return [];
  }

  if (Array.isArray(value)) {
    return value
      .flatMap((entry) => normalizeArrayQueryValue(entry))
      .filter((entry) => entry.length > 0);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  return [String(value).trim()].filter((item) => item.length > 0);
}

function normalizeScalarQueryValue(value: unknown): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (Array.isArray(value)) {
    const first = value.find((entry) => entry !== undefined && entry !== null);
    return normalizeScalarQueryValue(first);
  }

  return String(value);
}

function normalizeOptionalScalarQueryValue(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (Array.isArray(value)) {
    const first = value.find((entry) => entry !== undefined && entry !== null);
    return normalizeOptionalScalarQueryValue(first);
  }

  return String(value);
}

function parseIsoDateOrThrow(value: string | null, field: string): Date | null {
  if (!value) return null;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw ValidationError(`Invalid ${field}. Expected ISO date string`);
  }

  return parsed;
}

function normalizeQuery(
  query: Record<string, unknown>,
): RawPurchaseRecordsQuery {
  return {
    sellerIds: normalizeArrayQueryValue(query.sellerIds),
    buyerIds: normalizeArrayQueryValue(query.buyerIds),
    hsnCodes: normalizeArrayQueryValue(query.hsnCodes),
    chemicalNames: normalizeArrayQueryValue(query.chemicalNames),
    fromDate: normalizeScalarQueryValue(query.fromDate),
    toDate: normalizeScalarQueryValue(query.toDate),
    page: normalizeOptionalScalarQueryValue(query.page),
    pageSize: normalizeOptionalScalarQueryValue(query.pageSize),
    sortField: normalizeOptionalScalarQueryValue(query.sortField),
    sortOrder: normalizeOptionalScalarQueryValue(query.sortOrder),
  };
}

export function validatePurchaseRecordsQuery(
  query: Record<string, unknown>,
): ValidatedPurchaseRecordsQuery {
  const normalized = normalizeQuery(query);
  const validated = validateWithZod(querySchema, normalized);

  const fromDate = parseIsoDateOrThrow(validated.fromDate, "fromDate");
  const toDate = parseIsoDateOrThrow(validated.toDate, "toDate");

  if (fromDate && toDate && fromDate > toDate) {
    throw ValidationError("fromDate cannot be greater than toDate");
  }

  return {
    sellerIds: validated.sellerIds,
    buyerIds: validated.buyerIds,
    hsnCodes: validated.hsnCodes,
    chemicalNames: validated.chemicalNames,
    fromDate,
    toDate,
    page: validated.page,
    pageSize: validated.pageSize,
    sortField: validated.sortField,
    sortOrder: validated.sortOrder,
  };
}
