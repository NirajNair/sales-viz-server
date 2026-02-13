import type { Context } from "elysia";
import type { GetMappingsResponseDto } from "../dto/get-mappings.dto";
import {
  buildGetMappingsResponse,
  validateGetMappingsRequest,
} from "../dto/get-mappings.dto";
import { ValidationError } from "../lib/errors";
import { parseExcel } from "../lib/excel";
import { getBatchMappingSuggestions } from "../lib/llm";
import { loggerWithContext } from "../lib/logger";

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
