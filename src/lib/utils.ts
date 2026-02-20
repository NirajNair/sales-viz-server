import { Parser } from "@json2csv/plainjs";
import { ValidationError } from "./errors";

export type CsvCell = string | number | boolean | null | undefined;

/**
 * Builds a CSV string from headers and row data using @json2csv/plainjs.
 * Preserves column order and handles escaping per RFC4180.
 */
export function buildCsv(headers: string[], rows: CsvCell[][]): string {
  const records = rows.map((row) => {
    const obj: Record<string, CsvCell> = {};
    headers.forEach((header, i) => {
      obj[header] = row[i];
    });
    return obj;
  });
  const parser = new Parser({ fields: headers });
  return parser.parse(records);
}

export function normalizeArrayQueryValue(value: unknown): string[] {
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

export function normalizeScalarQueryValue(value: unknown): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (Array.isArray(value)) {
    const first = value.find((entry) => entry !== undefined && entry !== null);
    return normalizeScalarQueryValue(first);
  }

  return String(value);
}

export function normalizeOptionalScalarQueryValue(
  value: unknown,
): string | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (Array.isArray(value)) {
    const first = value.find((entry) => entry !== undefined && entry !== null);
    return normalizeOptionalScalarQueryValue(first);
  }

  return String(value);
}

export function parseIsoDateOrThrow(
  value: string | null,
  field: string,
): Date | null {
  if (!value) return null;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw ValidationError(`Invalid ${field}. Expected ISO date string`);
  }

  return parsed;
}
