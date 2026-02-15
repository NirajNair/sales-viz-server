import { z } from "zod";
import { MANDATORY_FIELDS, MAX_EXCEL_FILE_SIZE } from "../lib/constants";
import { ValidationError } from "../lib/errors";
import { validateWithZod } from "../lib/validation";

export const MappingPartSchema = z.object({
  index: z.number(),
  name: z.string(),
  mapTo: z.string(),
});

export const MappingSchema = z.object({
  excelColumnIndex: z.number(),
  excelHeader: z.string(),
  sampleValue: z.string(),
  shouldSplit: z.boolean(),
  delimiter: z.string().nullable(),
  mappedTo: z.string().nullable(),
  parts: z.array(MappingPartSchema),
});

export const LoadDataFileSchema = z
  .instanceof(File)
  .refine((file) => file.size > 0, "File is empty")
  .refine(
    (file) => file.size <= MAX_EXCEL_FILE_SIZE,
    `File size must be less than 10MB`,
  )
  .refine((file) => {
    const name = file.name?.toLowerCase() ?? "";
    return (
      name.endsWith(".xlsx") ||
      name.endsWith(".xls") ||
      file.type ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      file.type === "application/vnd.ms-excel"
    );
  }, "Only .xlsx or .xls files are supported");

export type Mapping = z.infer<typeof MappingSchema>;
export type MappingPart = z.infer<typeof MappingPartSchema>;

export interface LoadDataResponseDto {
  message: string;
  count: number;
}

/**
 * Validates the load data request including file and mappings.
 * Checks for mandatory fields coverage and duplicate mappings.
 */
export function validateLoadDataRequest(
  file: unknown,
  mappingsJson: unknown,
): { file: File; mappings: Mapping[] } {
  const validatedFile = validateWithZod(LoadDataFileSchema, file);

  let mappings: unknown;
  try {
    if (typeof mappingsJson !== "string") {
      throw ValidationError("Mappings must be a JSON string");
    }
    mappings = JSON.parse(mappingsJson);
  } catch (error) {
    throw ValidationError(
      `Invalid mappings JSON: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }

  if (!Array.isArray(mappings)) {
    throw ValidationError("Mappings must be an array");
  }

  const validatedMappings = mappings.map((m, index) => {
    try {
      return validateWithZod(MappingSchema, m);
    } catch (error) {
      throw ValidationError(
        `Invalid mapping at index ${index}: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  });

  validateMandatoryFields(validatedMappings);
  validateNoDuplicateMappings(validatedMappings);

  return { file: validatedFile, mappings: validatedMappings };
}

/**
 * Validates that all mandatory fields are mapped.
 */
function validateMandatoryFields(mappings: Mapping[]): void {
  const mappedFields = new Set<string>();

  for (const mapping of mappings) {
    if (mapping.mappedTo) {
      mappedFields.add(mapping.mappedTo);
    }
    for (const part of mapping.parts) {
      if (part.mapTo) {
        mappedFields.add(part.mapTo);
      }
    }
  }

  const missingFields = MANDATORY_FIELDS.filter(
    (field) => !mappedFields.has(field),
  );

  if (missingFields.length > 0) {
    throw ValidationError(
      `Missing mandatory field mappings: ${missingFields.join(", ")}`,
    );
  }
}

/**
 * Validates that no DB field is mapped more than once.
 */
function validateNoDuplicateMappings(mappings: Mapping[]): void {
  const fieldCounts = new Map<string, number>();

  for (const mapping of mappings) {
    if (mapping.mappedTo) {
      fieldCounts.set(
        mapping.mappedTo,
        (fieldCounts.get(mapping.mappedTo) || 0) + 1,
      );
    }
    for (const part of mapping.parts) {
      if (part.mapTo) {
        fieldCounts.set(part.mapTo, (fieldCounts.get(part.mapTo) || 0) + 1);
      }
    }
  }

  const duplicates = Array.from(fieldCounts.entries())
    .filter(([, count]) => count > 1)
    .map(([field]) => field);

  if (duplicates.length > 0) {
    throw ValidationError(
      `Duplicate field mappings detected: ${duplicates.join(", ")}`,
    );
  }
}

/**
 * Builds the success response for load data endpoint.
 */
export function buildLoadDataResponse(count: number): LoadDataResponseDto {
  return {
    message: `Successfully loaded ${count} records`,
    count,
  };
}
