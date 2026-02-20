import { z } from "zod";
import { ValidationError } from "../lib/errors";
import { validateWithZod } from "../lib/validation";

export interface GraphNode {
  id: string;
  name: string;
  gstin: string;
  isBuyer: boolean;
  isSeller: boolean;
  isSelected: boolean;
}

export interface HsnDetail {
  code: string;
  chemicalName: string;
}

export interface GraphLink {
  source: string;
  target: string;
  hsnDetails: HsnDetail[];
}

export interface GraphResponse {
  nodes: GraphNode[];
  links: GraphLink[];
}

export interface NexusFilterOptionsResponse {
  entities: Array<{
    id: string;
    name: string;
    gstin: string;
  }>;
  hsnCodes: Array<{
    code: string;
  }>;
}

export interface RawGraphRecord {
  sellerId: string;
  sellerName: string;
  sellerGstin: string;
  sellerIsBuyer: boolean;
  sellerIsSeller: boolean;
  buyerId: string;
  buyerName: string;
  buyerGstin: string;
  buyerIsBuyer: boolean;
  buyerIsSeller: boolean;
  hsnCode: string;
  chemicalName: string;
}

export interface ValidatedNexusGraphQuery {
  entityIds: string[];
  hsnCodes: string[];
  fromDate: Date | null;
  toDate: Date | null;
}

const graphQuerySchema = z.object({
  entityIds: z.array(z.uuid({ message: "Invalid entityIds value" })).min(1),
  hsnCodes: z
    .array(z.string({ message: "Invalid hsnCodes value" }))
    .default([]),
  fromDate: z.string().nullable(),
  toDate: z.string().nullable(),
});

type RawNexusGraphQuery = {
  entityIds: string[];
  hsnCodes: string[];
  fromDate: string | null;
  toDate: string | null;
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

function parseIsoDateOrThrow(value: string | null, field: string): Date | null {
  if (!value) return null;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw ValidationError(`Invalid ${field}. Expected ISO date string`);
  }

  return parsed;
}

function normalizeGraphQuery(
  query: Record<string, unknown>,
): RawNexusGraphQuery {
  return {
    entityIds: normalizeArrayQueryValue(query.entityIds),
    hsnCodes: normalizeArrayQueryValue(query.hsnCodes),
    fromDate: normalizeScalarQueryValue(query.fromDate),
    toDate: normalizeScalarQueryValue(query.toDate),
  };
}

export function validateNexusGraphQuery(
  query: Record<string, unknown>,
): ValidatedNexusGraphQuery {
  const normalized = normalizeGraphQuery(query);
  const validated = validateWithZod(graphQuerySchema, normalized);

  let fromDate = parseIsoDateOrThrow(validated.fromDate, "fromDate");
  let toDate = parseIsoDateOrThrow(validated.toDate, "toDate");

  // Default to last 6 months if dates not provided
  if (!fromDate && !toDate) {
    toDate = new Date();
    fromDate = new Date();
    fromDate.setMonth(fromDate.getMonth() - 6);
  } else if (!fromDate) {
    fromDate = new Date(0); // Unix epoch
  } else if (!toDate) {
    toDate = new Date();
  }

  if (fromDate && toDate && fromDate > toDate) {
    throw ValidationError("fromDate cannot be greater than toDate");
  }

  return {
    entityIds: validated.entityIds,
    hsnCodes: validated.hsnCodes,
    fromDate: fromDate ?? null,
    toDate: toDate ?? null,
  };
}
