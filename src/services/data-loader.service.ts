import { eq } from "drizzle-orm";
import * as XLSX from "xlsx";
import { db } from "../db";
import { entities, hsnCodes, purchaseRecords } from "../db/schema";
import type { Mapping } from "../dto/load-data.dto";
import { DbFieldMapping } from "../enums/db-field-mapping.enum";
import { parseAnyDate } from "../lib/date-parser";
import { ValidationError } from "../lib/errors";

interface ParsedRow {
  sellerGstin: string;
  sellerName: string;
  sellerPlace?: string;
  sellerPin?: string;
  buyerGstin: string;
  buyerName: string;
  buyerPlace?: string;
  buyerPin?: string;
  invoiceNo?: string;
  invoiceDate?: Date;
  state?: string;
  ewbNo?: string;
  ewbDate?: Date;
  assessVal: number | null;
  taxVal?: number | null;
  hsnCode: string;
  hsnChemicalName?: string;
}

/**
 * Loads data from Excel file into database based on provided mappings.
 * Uses transaction to ensure all-or-nothing behavior.
 */
export async function loadDataFromExcel(
  file: File,
  mappings: Mapping[],
): Promise<number> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });

  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) {
    throw ValidationError("Excel file has no sheets");
  }

  const sheet = workbook.Sheets[firstSheet];
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    defval: "",
  }) as unknown[][];

  if (rows.length < 2) {
    throw ValidationError(
      "Excel file must have at least a header row and one data row",
    );
  }

  // Skip header row, process all data rows
  const dataRows = rows.slice(1);
  const parsedRows: ParsedRow[] = [];

  for (let rowIndex = 0; rowIndex < dataRows.length; rowIndex++) {
    const row = dataRows[rowIndex];
    try {
      const parsedRow = parseRow(row, mappings);
      parsedRows.push(parsedRow);
    } catch (error) {
      throw ValidationError(
        `Row ${rowIndex + 2}: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  // Insert all data in a transaction
  return await db.transaction(async (tx: any) => {
    let count = 0;

    for (const parsedRow of parsedRows) {
      // Upsert seller entity
      const seller = await upsertEntity(tx, {
        gstin: parsedRow.sellerGstin,
        name: parsedRow.sellerName,
        place: parsedRow.sellerPlace,
        pin: parsedRow.sellerPin,
        isSeller: true,
      });

      // Upsert buyer entity
      const buyer = await upsertEntity(tx, {
        gstin: parsedRow.buyerGstin,
        name: parsedRow.buyerName,
        place: parsedRow.buyerPlace,
        pin: parsedRow.buyerPin,
        isBuyer: true,
      });

      // Always create new HSN record
      const [hsn] = await tx
        .insert(hsnCodes)
        .values({
          code: parsedRow.hsnCode,
          chemicalName: parsedRow.hsnChemicalName ?? "",
        })
        .returning();

      // Insert purchase record
      await tx.insert(purchaseRecords).values({
        supplierEntityId: seller.id,
        buyerEntityId: buyer.id,
        hsnCodeId: hsn.id,
        invoiceNo: parsedRow.invoiceNo,
        invoiceDate: parsedRow.invoiceDate,
        state: parsedRow.state,
        ewbNo: parsedRow.ewbNo,
        ewbDate: parsedRow.ewbDate,
        assessVal: parsedRow.assessVal,
        taxVal: parsedRow.taxVal,
      });

      count++;
    }

    return count;
  });
}

/**
 * Parses a single row based on the mappings.
 */
function parseRow(row: unknown[], mappings: Mapping[]): ParsedRow {
  const result: Partial<ParsedRow> = {};

  for (const mapping of mappings) {
    console.log("mapping", mapping);
    const cellValue = String(row[mapping.excelColumnIndex] ?? "").trim();

    if (mapping.shouldSplit && mapping.delimiter) {
      const parts = cellValue.split(mapping.delimiter);
      console.log("parts", parts);

      for (const partMapping of mapping.parts) {
        const partValue = parts[partMapping.index]?.trim() ?? "";
        console.log("partValue", partMapping.mapTo, partValue);
        applyMapping(result, partMapping.mapTo, partValue);
      }
    } else if (mapping.mappedTo) {
      console.log("mapping.mappedTo", mapping.mappedTo, cellValue);
      applyMapping(result, mapping.mappedTo, cellValue);
    }
  }

  // Validate mandatory fields
  if (!result.sellerGstin) {
    throw new Error("Missing seller GSTIN");
  }
  if (!result.sellerName) {
    throw new Error("Missing seller name");
  }
  if (!result.buyerGstin) {
    throw new Error("Missing buyer GSTIN");
  }
  if (!result.buyerName) {
    throw new Error("Missing buyer name");
  }
  if (result.assessVal === undefined || result.assessVal === null) {
    throw new Error("Missing assessable value");
  }
  if (!result.hsnCode) {
    throw new Error("Missing HSN code");
  }

  return result as ParsedRow;
}

/**
 * Applies a value to the appropriate field in the result object.
 */
function applyMapping(
  result: Partial<ParsedRow>,
  mapTo: string,
  value: string,
): void {
  switch (mapTo) {
    case DbFieldMapping.SELLER_GSTIN:
      result.sellerGstin = value;
      break;
    case DbFieldMapping.SELLER_NAME:
      result.sellerName = value;
      break;
    case DbFieldMapping.SELLER_PLACE:
      result.sellerPlace = value;
      break;
    case DbFieldMapping.SELLER_PIN:
      result.sellerPin = value;
      break;
    case DbFieldMapping.BUYER_GSTIN:
      result.buyerGstin = value;
      break;
    case DbFieldMapping.BUYER_NAME:
      result.buyerName = value;
      break;
    case DbFieldMapping.BUYER_PLACE:
      result.buyerPlace = value;
      break;
    case DbFieldMapping.BUYER_PIN:
      result.buyerPin = value;
      break;
    case DbFieldMapping.PURCHASE_INVOICE_NO:
      result.invoiceNo = value;
      break;
    case DbFieldMapping.PURCHASE_INVOICE_DATE:
      result.invoiceDate = parseAnyDate(value) ?? undefined;
      break;
    case DbFieldMapping.PURCHASE_STATE:
      result.state = value;
      break;
    case DbFieldMapping.PURCHASE_EWB_NO:
      result.ewbNo = value;
      break;
    case DbFieldMapping.PURCHASE_EWB_DATE:
      result.ewbDate = parseAnyDate(value) ?? undefined;
      break;
    case DbFieldMapping.PURCHASE_ASSESS_VAL:
      result.assessVal = parseNumeric(value);
      break;
    case DbFieldMapping.PURCHASE_TAX_VAL:
      result.taxVal = parseNumeric(value);
      break;
    case DbFieldMapping.HSN_CODE:
      result.hsnCode = value;
      break;
    case DbFieldMapping.HSN_CHEMICAL_NAME:
      result.hsnChemicalName = value;
      break;
  }
}

/**
 * Parses a numeric value from string.
 * Returns null for empty values, number rounded to 2 decimal places otherwise.
 */
function parseNumeric(value: string): number | null {
  if (!value || value.trim() === "") {
    return null;
  }
  const cleaned = value.replace(/,/g, "").trim();
  const parsed = parseFloat(cleaned);
  if (isNaN(parsed)) {
    throw new Error(`Invalid numeric value: "${value}"`);
  }
  return Math.round(parsed * 100) / 100;
}

/**
 * Upserts an entity by GSTIN. Updates existing or creates new.
 */
async function upsertEntity(
  tx: any,
  entity: {
    gstin: string;
    name: string;
    place?: string;
    pin?: string;
    isSeller?: boolean;
    isBuyer?: boolean;
  },
) {
  // Check if entity exists
  const existingEntity = await tx
    .select()
    .from(entities)
    .where(eq(entities.gstin, entity.gstin))
    .limit(1);

  if (existingEntity.length > 0) {
    // Update existing entity
    const [updated] = await tx
      .update(entities)
      .set({
        name: entity.name,
        place: entity.place ?? existingEntity[0].place,
        pin: entity.pin ?? existingEntity[0].pin,
        isSeller: entity.isSeller || existingEntity[0].isSeller,
        isBuyer: entity.isBuyer || existingEntity[0].isBuyer,
      })
      .where(eq(entities.id, existingEntity[0].id))
      .returning();
    return updated;
  } else {
    // Create new entity
    const [created] = await tx
      .insert(entities)
      .values({
        gstin: entity.gstin,
        name: entity.name,
        place: entity.place,
        pin: entity.pin,
        isSeller: entity.isSeller ?? false,
        isBuyer: entity.isBuyer ?? false,
      })
      .returning();
    return created;
  }
}
