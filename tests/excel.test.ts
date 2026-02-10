import { describe, expect, test } from "bun:test";
import { parseExcel, type ParsedExcel } from "../src/lib/excel";
import * as XLSX from "xlsx";

function createExcelBuffer(data: unknown[][]): Buffer {
  const worksheet = XLSX.utils.aoa_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  return buffer;
}

function createMockFile(buffer: Buffer, name: string, type: string): File {
  return new File([buffer], name, { type });
}

describe("parseExcel", () => {
  test("should parse a valid Excel file with headers and data", async () => {
    const data = [
      ["Name", "Age", "City"],
      ["John Doe", "30", "New York"],
      ["Jane Smith", "25", "Los Angeles"],
    ];
    const buffer = createExcelBuffer(data);
    const file = createMockFile(
      buffer,
      "test.xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );

    const result = await parseExcel(file);

    expect(result.columns).toHaveLength(3);
    expect(result.columns[0]).toEqual({
      index: 0,
      header: "Name",
      sampleValue: "John Doe",
    });
    expect(result.columns[1]).toEqual({
      index: 1,
      header: "Age",
      sampleValue: "30",
    });
    expect(result.columns[2]).toEqual({
      index: 2,
      header: "City",
      sampleValue: "New York",
    });
  });

  test("should handle Excel file with empty sample values", async () => {
    const data = [["Header1", "Header2"], ["", ""]];
    const buffer = createExcelBuffer(data);
    const file = createMockFile(
      buffer,
      "test.xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );

    const result = await parseExcel(file);

    expect(result.columns).toHaveLength(2);
    expect(result.columns[0].sampleValue).toBe("");
    expect(result.columns[1].sampleValue).toBe("");
  });

  test("should handle Excel file with headers only (no data rows)", async () => {
    const data = [["Header1", "Header2", "Header3"]];
    const buffer = createExcelBuffer(data);
    const file = createMockFile(
      buffer,
      "test.xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );

    const result = await parseExcel(file);

    expect(result.columns).toHaveLength(3);
    expect(result.columns[0].sampleValue).toBe("");
    expect(result.columns[1].sampleValue).toBe("");
    expect(result.columns[2].sampleValue).toBe("");
  });

  test("should throw error for empty Excel file (no header row)", async () => {
    const data: unknown[][] = [];
    const buffer = createExcelBuffer(data);
    const file = createMockFile(
      buffer,
      "empty.xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );

    await expect(parseExcel(file)).rejects.toThrow("Excel file has no header row");
  });

  test("should throw error for Excel file with empty header row", async () => {
    const data = [["", ""], ["data1", "data2"]];
    const buffer = createExcelBuffer(data);
    const file = createMockFile(
      buffer,
      "empty-header.xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );

    await expect(parseExcel(file)).rejects.toThrow(
      "Excel header row is empty",
    );
  });

  test("should trim whitespace from headers and sample values", async () => {
    const data = [
      ["  Name  ", "  Age  "],
      ["  John  ", "  30  "],
    ];
    const buffer = createExcelBuffer(data);
    const file = createMockFile(
      buffer,
      "test.xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );

    const result = await parseExcel(file);

    expect(result.columns[0].header).toBe("Name");
    expect(result.columns[0].sampleValue).toBe("John");
    expect(result.columns[1].header).toBe("Age");
    expect(result.columns[1].sampleValue).toBe("30");
  });

  test("should handle numeric and boolean values by converting to string", async () => {
    const data = [
      ["ID", "Active", "Amount"],
      [123, true, 99.99],
    ];
    const buffer = createExcelBuffer(data);
    const file = createMockFile(
      buffer,
      "test.xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );

    const result = await parseExcel(file);

    expect(result.columns[0].sampleValue).toBe("123");
    expect(result.columns[1].sampleValue).toBe("TRUE");
    expect(result.columns[2].sampleValue).toBe("99.99");
  });

  test("should filter out columns with empty headers", async () => {
    const data = [
      ["Name", "", "Age", ""],
      ["John", "empty", "30", "data"],
    ];
    const buffer = createExcelBuffer(data);
    const file = createMockFile(
      buffer,
      "test.xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );

    const result = await parseExcel(file);

    expect(result.columns).toHaveLength(2);
    expect(result.columns[0].header).toBe("Name");
    expect(result.columns[1].header).toBe("Age");
  });

  test("should handle Excel with multiple sheets and use the first one", async () => {
    const data = [["Sheet1Header"], ["Sheet1Data"]];
    const buffer = createExcelBuffer(data);
    const file = createMockFile(
      buffer,
      "test.xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );

    const result = await parseExcel(file);

    expect(result.columns).toHaveLength(1);
    expect(result.columns[0].header).toBe("Sheet1Header");
  });
});
