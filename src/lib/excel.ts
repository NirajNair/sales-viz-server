import * as XLSX from "xlsx";

export type ParsedColumn = {
  index: number;
  header: string;
  sampleValue: string;
};

export type ParsedExcel = {
  columns: ParsedColumn[];
};

export async function parseExcel(file: File): Promise<ParsedExcel> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });

  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) {
    throw new Error("Excel file has no sheets");
  }

  const sheet = workbook.Sheets[firstSheet];
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    defval: "",
  }) as unknown[][];

  const headerRow = rows[0] ?? [];
  if (headerRow.length === 0) {
    throw new Error("Excel file has no header row");
  }

  const sampleRow = rows[1] ?? [];

  const columns = headerRow
    .map((header, index) => ({
      index,
      header: String(header ?? "").trim(),
      sampleValue: String(sampleRow[index] ?? "").trim(),
    }))
    .filter((column) => column.header.length > 0);

  if (columns.length === 0) {
    throw new Error("Excel header row is empty");
  }

  return { columns };
}
