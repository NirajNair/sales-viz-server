import { z } from "zod";
import type { ParsedColumn } from "../lib/excel";
import type { LlmBatchSuggestion } from "../lib/llm";
import { validateWithZod } from "../lib/validation";

export const GetMappingsRequestSchema = z.object({
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

// Validation helper
export function validateGetMappingsRequest(file: unknown): File {
  return validateWithZod(GetMappingsRequestSchema, { file }).file;
}

// Type inference from schema
export type GetMappingsRequestDto = z.infer<typeof GetMappingsRequestSchema>;

// Excel column from parsed file
export interface ExcelColumnDto {
  index: number;
  header: string;
  sampleValue: string;
}

// Entity type discriminator
export type EntityType = "seller" | "buyer";

// Structured entity field info
export interface EntityFieldDto {
  entityType: EntityType;
  field: string; // e.g., 'name', 'gstin', 'place', 'pin'
}

// Column mapping suggestion (enriched)
export interface ColumnMappingSuggestionDto {
  header: string;
  shouldSplit: boolean;
  delimiter: string | null;
  mapTo: string | null; // Full DB column like 'seller_entity.name'
  entityField: EntityFieldDto | null; // Parsed entity info
  parts: Array<{
    index: number;
    name: string;
    mapTo: string | null;
    entityField: EntityFieldDto | null;
  }>;
}

// Response DTO for upload endpoint
export interface GetMappingsResponseDto {
  columns: ExcelColumnDto[];
  llmSuggestions: Array<{
    header: string;
    suggestion: {
      shouldSplit: boolean;
      delimiter: string | null;
      mapTo: string | null;
      entityField: EntityFieldDto | null;
      parts: Array<{
        index: number;
        name: string;
        mapTo: string | null;
        entityField: EntityFieldDto | null;
      }>;
    };
  }>;
}

/**
 * Parses a database column name to extract entity field information.
 * Returns null if the column is not an entity field.
 */
function parseEntityField(mapTo: string | null): EntityFieldDto | null {
  if (!mapTo) return null;

  if (mapTo.startsWith("seller_entity.")) {
    return {
      entityType: "seller",
      field: mapTo.replace("seller_entity.", ""),
    };
  }

  if (mapTo.startsWith("buyer_entity.")) {
    return {
      entityType: "buyer",
      field: mapTo.replace("buyer_entity.", ""),
    };
  }

  return null;
}

/**
 * Builds the upload response DTO from parsed Excel columns and LLM batch suggestions.
 * Transforms LLM suggestions into the response format expected by the API.
 */
export function buildGetMappingsResponse(
  columns: ParsedColumn[],
  batchResult: LlmBatchSuggestion,
): GetMappingsResponseDto {
  const llmSuggestions = batchResult.columns.map((col) => ({
    header: col.header,
    suggestion: {
      shouldSplit: col.should_split,
      delimiter: col.delimiter,
      mapTo: col.map_to,
      entityField: parseEntityField(col.map_to),
      parts: col.parts.map((part) => ({
        index: part.index,
        name: part.name,
        mapTo: part.map_to,
        entityField: parseEntityField(part.map_to),
      })),
    },
  }));

  return {
    columns,
    llmSuggestions,
  };
}
