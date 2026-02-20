import { z } from "zod";
import { ValidationError } from "../lib/errors";
import {
  normalizeArrayQueryValue,
  normalizeScalarQueryValue,
  parseIsoDateOrThrow,
} from "../lib/utils";
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
  buyerId: string;
  buyerName: string;
  buyerGstin: string;
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

  if (!fromDate || !toDate) {
    throw ValidationError("Date range is required");
  }

  if (fromDate && toDate && fromDate > toDate) {
    throw ValidationError("Start date cannot be greater than end date");
  }

  return {
    entityIds: validated.entityIds,
    hsnCodes: validated.hsnCodes,
    fromDate: fromDate ?? null,
    toDate: toDate ?? null,
  };
}
