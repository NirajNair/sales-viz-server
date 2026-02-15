import type { Context } from "elysia";
import type { GetMappingsResponseDto } from "../dto/get-mappings.dto";
import {
  buildGetMappingsResponse,
  validateGetMappingsRequest,
} from "../dto/get-mappings.dto";
import type { LoadDataResponseDto } from "../dto/load-data.dto";
import {
  buildLoadDataResponse,
  validateLoadDataRequest,
} from "../dto/load-data.dto";
import { ValidationError } from "../lib/errors";
import { parseExcel } from "../lib/excel";
import { getBatchMappingSuggestions } from "../lib/llm";
import { loggerWithContext } from "../lib/logger";
import { loadDataFromExcel } from "../services/data-loader.service";

function getDbSchemaColumns(): string[] {
  return [
    // purchase_records - data columns only (no IDs, no timestamps)
    "purchase_records.invoice_no",
    "purchase_records.invoice_date",
    "purchase_records.state",
    "purchase_records.ewb_no",
    "purchase_records.ewb_date",
    "purchase_records.assess_val",
    "purchase_records.tax_val",

    // seller entity columns
    "seller_entity.name",
    "seller_entity.gstin",
    "seller_entity.place",
    "seller_entity.pin",

    // buyer entity columns
    "buyer_entity.name",
    "buyer_entity.gstin",
    "buyer_entity.place",
    "buyer_entity.pin",

    // hsn codes
    "hsn_codes.code",
    "hsn_codes.chemical_name",
  ];
}

export type LoadDataDependencies = {
  parseExcel: typeof parseExcel;
  getBatchMappingSuggestions: typeof getBatchMappingSuggestions;
  loggerWithContext: Pick<typeof loggerWithContext, "error">;
};

export function createHandleGetMappings(deps: LoadDataDependencies) {
  return async function handleGetMappings({
    request,
  }: Context): Promise<GetMappingsResponseDto> {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (error) {
      deps.loggerWithContext.error(
        { err: error },
        "Unable to parse upload form data",
      );
      throw ValidationError(
        error instanceof Error
          ? error.message
          : "Unable to parse upload form data",
      );
    }

    const file = formData.get("file");
    const validatedFile = validateGetMappingsRequest(file);

    let columns;
    try {
      const parsed = await deps.parseExcel(validatedFile);
      columns = parsed.columns;
    } catch (error) {
      throw ValidationError(
        error instanceof Error ? error.message : "Failed to parse Excel file",
      );
    }

    const dbColumns = getDbSchemaColumns();

    const batchResult = await deps.getBatchMappingSuggestions(
      columns.map((col) => ({
        header: col.header,
        sampleValue: col.sampleValue,
      })),
      dbColumns,
    );

    return buildGetMappingsResponse(columns, batchResult);
  };
}

export const handleGetMappings = createHandleGetMappings({
  parseExcel,
  getBatchMappingSuggestions,
  loggerWithContext,
});

export async function handleLoadData({
  request,
}: Context): Promise<LoadDataResponseDto> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (error) {
    loggerWithContext.error({ err: error }, "Unable to parse upload form data");
    throw ValidationError(
      error instanceof Error
        ? error.message
        : "Unable to parse upload form data",
    );
  }

  const file = formData.get("file");
  const mappingsJson = formData.get("mappings");

  if (!file || !(file instanceof File)) {
    throw ValidationError("No file provided");
  }

  if (!mappingsJson || typeof mappingsJson !== "string") {
    throw ValidationError("No mappings provided");
  }

  const { file: validatedFile, mappings } = validateLoadDataRequest(
    file,
    mappingsJson,
  );

  const updatedMappings = mappings.filter((mapping) => {
    return (
      (!mapping.parts.length && mapping.mappedTo !== null) ||
      mapping.parts.some((part) => part.mapTo !== null)
    );
  });

  try {
    const count = await loadDataFromExcel(validatedFile, updatedMappings);
    return buildLoadDataResponse(count);
  } catch (error) {
    loggerWithContext.error({ err: error }, "Failed to load data from Excel");
    if (error instanceof Error && error.message.startsWith("Missing ")) {
      throw ValidationError(error.message);
    }
    throw error;
  }
}
