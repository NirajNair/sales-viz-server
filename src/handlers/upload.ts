import type { Context } from "elysia";
import { z } from "zod";
import { entities, hsnCodes, purchaseRecords } from "../db/schema";
import { parseExcel } from "../lib/excel";
import {
  getBatchMappingSuggestions,
  type LlmBatchSuggestion,
} from "../lib/llm";
import { ValidationError } from "../lib/errors";
import { loggerWithContext } from "../lib/logger";

const UploadSchema = z.object({
  file: z
    .instanceof(File)
    .refine((file) => file.size > 0, "File is empty")
    .refine((file) => {
      const name = file.name?.toLowerCase() ?? "";
      return (
        name.endsWith(".xlsx") ||
        name.endsWith(".xls") ||
        file.type ===
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
        file.type === "application/vnd.ms-excel"
      );
    }, "Only .xlsx or .xls files are supported"),
});

const columnsSymbol = Symbol.for("drizzle:Columns");
const nameSymbol = Symbol.for("drizzle:Name");

function getTableColumnNames(table: unknown) {
  const columns = (table as Record<symbol, unknown>)[columnsSymbol];
  if (!columns || typeof columns !== "object") {
    return [];
  }

  return Object.values(columns as Record<string, unknown>)
    .map((column) => (column as { name?: unknown }).name)
    .filter((name): name is string => typeof name === "string");
}

function getQualifiedColumnNames(table: unknown) {
  const tableName = (table as Record<symbol, unknown>)[nameSymbol];
  const prefix = typeof tableName === "string" ? `${tableName}.` : "";
  return getTableColumnNames(table).map((name) => `${prefix}${name}`);
}

function getDbSchemaColumns() {
  return [
    ...getQualifiedColumnNames(purchaseRecords),
    ...getQualifiedColumnNames(entities),
    ...getQualifiedColumnNames(hsnCodes),
  ];
}

export async function handleUpload({ request, set }: Context) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (error) {
    loggerWithContext.error({ err: error }, "Unable to parse upload form data");
    throw ValidationError(
      error instanceof Error
        ? error.message
        : "Unable to parse upload form data"
    );
  }

  const file = formData.get("file");
  const validation = UploadSchema.safeParse({ file });
  if (!validation.success) {
    throw ValidationError(
      validation.error.issues[0]?.message ?? "Invalid upload file"
    );
  }

  let columns;
  try {
    const parsed = await parseExcel(validation.data.file);
    columns = parsed.columns;
  } catch (error) {
    throw ValidationError(
      error instanceof Error ? error.message : "Failed to parse Excel file"
    );
  }

  const dbColumns = getDbSchemaColumns();

  const batchResult = await getBatchMappingSuggestions(
    columns.map((col) => ({
      header: col.header,
      sampleValue: col.sampleValue,
    })),
    dbColumns,
  );

  const llmSuggestions = batchResult.columns.map((col) => ({
    header: col.header,
    suggestion: {
      should_split: col.should_split,
      delimiter: col.delimiter,
      map_to: col.map_to,
      parts: col.parts,
    },
  }));

  return {
    columns,
    llmSuggestions,
  };
}
