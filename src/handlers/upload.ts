import type { Context } from "elysia";
import type { UploadResponseDto } from "../dto/upload.dto";
import { buildUploadResponse, validateUpload } from "../dto/upload.dto";
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

export async function handleUpload({
  request,
}: Context): Promise<UploadResponseDto> {
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
  const validatedFile = validateUpload(file);

  let columns;
  try {
    const parsed = await parseExcel(validatedFile);
    columns = parsed.columns;
  } catch (error) {
    throw ValidationError(
      error instanceof Error ? error.message : "Failed to parse Excel file",
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

  return buildUploadResponse(columns, batchResult);
}
