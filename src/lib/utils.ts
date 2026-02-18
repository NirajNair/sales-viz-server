import { Parser } from "@json2csv/plainjs";

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
