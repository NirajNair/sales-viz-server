import { z } from "zod";
import type { ParsedColumn } from "../lib/excel";
import type { LlmBatchSuggestion } from "../lib/llm";
import { validateWithZod } from "../lib/validation";

export const UploadRequestSchema = z.object({
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
export function validateUpload(file: unknown): File {
  return validateWithZod(UploadRequestSchema, { file }).file;
}

// Type inference from schema
export type UploadRequestDto = z.infer<typeof UploadRequestSchema>;

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
export interface UploadResponseDto {
  columns: ExcelColumnDto[];
  llmSuggestions: Array<{
    header: string;
    suggestion: {
      should_split: boolean;
      delimiter: string | null;
      map_to: string | null;
      entity_field: EntityFieldDto | null;
      parts: Array<{
        index: number;
        name: string;
        map_to: string | null;
        entity_field: EntityFieldDto | null;
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
export function buildUploadResponse(
  columns: ParsedColumn[],
  batchResult: LlmBatchSuggestion,
): UploadResponseDto {
  const llmSuggestions = batchResult.columns.map((col) => ({
    header: col.header,
    suggestion: {
      should_split: col.should_split,
      delimiter: col.delimiter,
      map_to: col.map_to,
      entity_field: parseEntityField(col.map_to),
      parts: col.parts.map((part) => ({
        index: part.index,
        name: part.name,
        map_to: part.map_to,
        entity_field: parseEntityField(part.map_to),
      })),
    },
  }));

  return {
    columns,
    llmSuggestions,
  };
}
