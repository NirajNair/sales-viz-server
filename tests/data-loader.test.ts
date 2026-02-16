import { describe, expect, test } from "bun:test";
import * as XLSX from "xlsx";
import type { Mapping } from "../src/dto/load-data.dto";
import { parseExcelToRows } from "../src/services/data-loader.service";

function createExcelBuffer(data: unknown[][]): Buffer {
  const worksheet = XLSX.utils.aoa_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  return buffer;
}

function createMockFile(buffer: Buffer, name: string, type: string): File {
  return new File([new Uint8Array(buffer)], name, { type });
}

describe("parseExcelToRows", () => {
  describe("File Validation", () => {
    test("should throw error for Excel file with no sheets", async () => {
      // Create a workbook with a sheet but then manually create a buffer that will fail
      // Since XLSX.write validates the workbook, we need to test with actual empty data
      const data: unknown[][] = [];
      const buffer = createExcelBuffer(data);
      const file = createMockFile(
        buffer,
        "empty.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );

      const mappings: Mapping[] = [];

      // This will throw because the sheet has no rows (not even a header)
      await expect(parseExcelToRows(file, mappings)).rejects.toThrow();
    });

    test("should throw error for Excel with only header row", async () => {
      const data = [["Header1", "Header2", "Header3"]];
      const buffer = createExcelBuffer(data);
      const file = createMockFile(
        buffer,
        "header-only.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );

      const mappings: Mapping[] = [];

      await expect(parseExcelToRows(file, mappings)).rejects.toThrow(
        "Excel file must have at least a header row and one data row",
      );
    });
  });

  describe("Valid Parsing", () => {
    test("should parse valid Excel with minimal mappings", async () => {
      const data = [
        [
          "Seller GSTIN",
          "Seller Name",
          "Buyer GSTIN",
          "Buyer Name",
          "Amount",
          "HSN Code",
        ],
        [
          "29ABCDE1234F1Z5",
          "Test Seller",
          "27XYZAB5678G1H9",
          "Test Buyer",
          "1000.00",
          "1234",
        ],
        [
          "29FGHIJ5678K2L6",
          "Another Seller",
          "27MNOPQ9012R3S4",
          "Another Buyer",
          "2000.50",
          "5678",
        ],
      ];
      const buffer = createExcelBuffer(data);
      const file = createMockFile(
        buffer,
        "test.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );

      const mappings: Mapping[] = [
        {
          excelColumnIndex: 0,
          excelHeader: "Seller GSTIN",
          sampleValue: "29ABCDE1234F1Z5",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "seller_entity.gstin",
          parts: [],
        },
        {
          excelColumnIndex: 1,
          excelHeader: "Seller Name",
          sampleValue: "Test Seller",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "seller_entity.name",
          parts: [],
        },
        {
          excelColumnIndex: 2,
          excelHeader: "Buyer GSTIN",
          sampleValue: "27XYZAB5678G1H9",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "buyer_entity.gstin",
          parts: [],
        },
        {
          excelColumnIndex: 3,
          excelHeader: "Buyer Name",
          sampleValue: "Test Buyer",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "buyer_entity.name",
          parts: [],
        },
        {
          excelColumnIndex: 4,
          excelHeader: "Amount",
          sampleValue: "1000.00",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "purchase_records.assess_val",
          parts: [],
        },
        {
          excelColumnIndex: 5,
          excelHeader: "HSN Code",
          sampleValue: "1234",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "hsn_codes.code",
          parts: [],
        },
      ];

      const result = await parseExcelToRows(file, mappings);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        sellerGstin: "29ABCDE1234F1Z5",
        sellerName: "Test Seller",
        buyerGstin: "27XYZAB5678G1H9",
        buyerName: "Test Buyer",
        assessVal: 1000.0,
        hsnCode: "1234",
      });
      expect(result[1]).toEqual({
        sellerGstin: "29FGHIJ5678K2L6",
        sellerName: "Another Seller",
        buyerGstin: "27MNOPQ9012R3S4",
        buyerName: "Another Buyer",
        assessVal: 2000.5,
        hsnCode: "5678",
      });
    });

    test("should parse optional fields correctly", async () => {
      const data = [
        [
          "Seller GSTIN",
          "Seller Name",
          "Seller Place",
          "Buyer GSTIN",
          "Buyer Name",
          "Amount",
          "HSN Code",
          "Invoice No",
          "State",
        ],
        [
          "29ABCDE1234F1Z5",
          "Test Seller",
          "Mumbai",
          "27XYZAB5678G1H9",
          "Test Buyer",
          "1000.00",
          "1234",
          "INV001",
          "Maharashtra",
        ],
      ];
      const buffer = createExcelBuffer(data);
      const file = createMockFile(
        buffer,
        "test.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );

      const mappings: Mapping[] = [
        {
          excelColumnIndex: 0,
          excelHeader: "Seller GSTIN",
          sampleValue: "29ABCDE1234F1Z5",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "seller_entity.gstin",
          parts: [],
        },
        {
          excelColumnIndex: 1,
          excelHeader: "Seller Name",
          sampleValue: "Test Seller",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "seller_entity.name",
          parts: [],
        },
        {
          excelColumnIndex: 2,
          excelHeader: "Seller Place",
          sampleValue: "Mumbai",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "seller_entity.place",
          parts: [],
        },
        {
          excelColumnIndex: 3,
          excelHeader: "Buyer GSTIN",
          sampleValue: "27XYZAB5678G1H9",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "buyer_entity.gstin",
          parts: [],
        },
        {
          excelColumnIndex: 4,
          excelHeader: "Buyer Name",
          sampleValue: "Test Buyer",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "buyer_entity.name",
          parts: [],
        },
        {
          excelColumnIndex: 5,
          excelHeader: "Amount",
          sampleValue: "1000.00",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "purchase_records.assess_val",
          parts: [],
        },
        {
          excelColumnIndex: 6,
          excelHeader: "HSN Code",
          sampleValue: "1234",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "hsn_codes.code",
          parts: [],
        },
        {
          excelColumnIndex: 7,
          excelHeader: "Invoice No",
          sampleValue: "INV001",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "purchase_records.invoice_no",
          parts: [],
        },
        {
          excelColumnIndex: 8,
          excelHeader: "State",
          sampleValue: "Maharashtra",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "purchase_records.state",
          parts: [],
        },
      ];

      const result = await parseExcelToRows(file, mappings);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        sellerGstin: "29ABCDE1234F1Z5",
        sellerName: "Test Seller",
        sellerPlace: "Mumbai",
        buyerGstin: "27XYZAB5678G1H9",
        buyerName: "Test Buyer",
        assessVal: 1000.0,
        hsnCode: "1234",
        invoiceNo: "INV001",
        state: "Maharashtra",
      });
    });
  });

  describe("Mandatory Field Validation", () => {
    test("should throw error for missing seller GSTIN", async () => {
      const data = [
        ["Seller Name", "Buyer GSTIN", "Buyer Name", "Amount", "HSN Code"],
        ["Test Seller", "27XYZAB5678G1H9", "Test Buyer", "1000.00", "1234"],
      ];
      const buffer = createExcelBuffer(data);
      const file = createMockFile(
        buffer,
        "test.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );

      const mappings: Mapping[] = [
        {
          excelColumnIndex: 0,
          excelHeader: "Seller Name",
          sampleValue: "Test Seller",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "seller_entity.name",
          parts: [],
        },
        {
          excelColumnIndex: 1,
          excelHeader: "Buyer GSTIN",
          sampleValue: "27XYZAB5678G1H9",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "buyer_entity.gstin",
          parts: [],
        },
        {
          excelColumnIndex: 2,
          excelHeader: "Buyer Name",
          sampleValue: "Test Buyer",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "buyer_entity.name",
          parts: [],
        },
        {
          excelColumnIndex: 3,
          excelHeader: "Amount",
          sampleValue: "1000.00",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "purchase_records.assess_val",
          parts: [],
        },
        {
          excelColumnIndex: 4,
          excelHeader: "HSN Code",
          sampleValue: "1234",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "hsn_codes.code",
          parts: [],
        },
      ];

      await expect(parseExcelToRows(file, mappings)).rejects.toThrow(
        "Row 2: Missing seller GSTIN",
      );
    });

    test("should throw error for missing buyer name", async () => {
      const data = [
        ["Seller GSTIN", "Seller Name", "Buyer GSTIN", "Amount", "HSN Code"],
        [
          "29ABCDE1234F1Z5",
          "Test Seller",
          "27XYZAB5678G1H9",
          "1000.00",
          "1234",
        ],
      ];
      const buffer = createExcelBuffer(data);
      const file = createMockFile(
        buffer,
        "test.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );

      const mappings: Mapping[] = [
        {
          excelColumnIndex: 0,
          excelHeader: "Seller GSTIN",
          sampleValue: "29ABCDE1234F1Z5",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "seller_entity.gstin",
          parts: [],
        },
        {
          excelColumnIndex: 1,
          excelHeader: "Seller Name",
          sampleValue: "Test Seller",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "seller_entity.name",
          parts: [],
        },
        {
          excelColumnIndex: 2,
          excelHeader: "Buyer GSTIN",
          sampleValue: "27XYZAB5678G1H9",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "buyer_entity.gstin",
          parts: [],
        },
        {
          excelColumnIndex: 3,
          excelHeader: "Amount",
          sampleValue: "1000.00",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "purchase_records.assess_val",
          parts: [],
        },
        {
          excelColumnIndex: 4,
          excelHeader: "HSN Code",
          sampleValue: "1234",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "hsn_codes.code",
          parts: [],
        },
      ];

      await expect(parseExcelToRows(file, mappings)).rejects.toThrow(
        "Row 2: Missing buyer name",
      );
    });

    test("should throw error for missing assessable value", async () => {
      const data = [
        [
          "Seller GSTIN",
          "Seller Name",
          "Buyer GSTIN",
          "Buyer Name",
          "HSN Code",
        ],
        [
          "29ABCDE1234F1Z5",
          "Test Seller",
          "27XYZAB5678G1H9",
          "Test Buyer",
          "1234",
        ],
      ];
      const buffer = createExcelBuffer(data);
      const file = createMockFile(
        buffer,
        "test.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );

      const mappings: Mapping[] = [
        {
          excelColumnIndex: 0,
          excelHeader: "Seller GSTIN",
          sampleValue: "29ABCDE1234F1Z5",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "seller_entity.gstin",
          parts: [],
        },
        {
          excelColumnIndex: 1,
          excelHeader: "Seller Name",
          sampleValue: "Test Seller",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "seller_entity.name",
          parts: [],
        },
        {
          excelColumnIndex: 2,
          excelHeader: "Buyer GSTIN",
          sampleValue: "27XYZAB5678G1H9",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "buyer_entity.gstin",
          parts: [],
        },
        {
          excelColumnIndex: 3,
          excelHeader: "Buyer Name",
          sampleValue: "Test Buyer",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "buyer_entity.name",
          parts: [],
        },
        {
          excelColumnIndex: 4,
          excelHeader: "HSN Code",
          sampleValue: "1234",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "hsn_codes.code",
          parts: [],
        },
      ];

      await expect(parseExcelToRows(file, mappings)).rejects.toThrow(
        "Row 2: Missing assessable value",
      );
    });

    test("should throw error for missing HSN code", async () => {
      const data = [
        ["Seller GSTIN", "Seller Name", "Buyer GSTIN", "Buyer Name", "Amount"],
        [
          "29ABCDE1234F1Z5",
          "Test Seller",
          "27XYZAB5678G1H9",
          "Test Buyer",
          "1000.00",
        ],
      ];
      const buffer = createExcelBuffer(data);
      const file = createMockFile(
        buffer,
        "test.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );

      const mappings: Mapping[] = [
        {
          excelColumnIndex: 0,
          excelHeader: "Seller GSTIN",
          sampleValue: "29ABCDE1234F1Z5",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "seller_entity.gstin",
          parts: [],
        },
        {
          excelColumnIndex: 1,
          excelHeader: "Seller Name",
          sampleValue: "Test Seller",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "seller_entity.name",
          parts: [],
        },
        {
          excelColumnIndex: 2,
          excelHeader: "Buyer GSTIN",
          sampleValue: "27XYZAB5678G1H9",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "buyer_entity.gstin",
          parts: [],
        },
        {
          excelColumnIndex: 3,
          excelHeader: "Buyer Name",
          sampleValue: "Test Buyer",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "buyer_entity.name",
          parts: [],
        },
        {
          excelColumnIndex: 4,
          excelHeader: "Amount",
          sampleValue: "1000.00",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "purchase_records.assess_val",
          parts: [],
        },
      ];

      await expect(parseExcelToRows(file, mappings)).rejects.toThrow(
        "Row 2: Missing HSN code",
      );
    });
  });

  describe("Numeric Parsing", () => {
    test("should parse numeric values correctly", async () => {
      const data = [
        [
          "Seller GSTIN",
          "Seller Name",
          "Buyer GSTIN",
          "Buyer Name",
          "Amount",
          "Tax",
          "HSN Code",
        ],
        [
          "29ABCDE1234F1Z5",
          "Test Seller",
          "27XYZAB5678G1H9",
          "Test Buyer",
          "1,234.56",
          "222.22",
          "1234",
        ],
      ];
      const buffer = createExcelBuffer(data);
      const file = createMockFile(
        buffer,
        "test.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );

      const mappings: Mapping[] = [
        {
          excelColumnIndex: 0,
          excelHeader: "Seller GSTIN",
          sampleValue: "29ABCDE1234F1Z5",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "seller_entity.gstin",
          parts: [],
        },
        {
          excelColumnIndex: 1,
          excelHeader: "Seller Name",
          sampleValue: "Test Seller",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "seller_entity.name",
          parts: [],
        },
        {
          excelColumnIndex: 2,
          excelHeader: "Buyer GSTIN",
          sampleValue: "27XYZAB5678G1H9",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "buyer_entity.gstin",
          parts: [],
        },
        {
          excelColumnIndex: 3,
          excelHeader: "Buyer Name",
          sampleValue: "Test Buyer",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "buyer_entity.name",
          parts: [],
        },
        {
          excelColumnIndex: 4,
          excelHeader: "Amount",
          sampleValue: "1,234.56",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "purchase_records.assess_val",
          parts: [],
        },
        {
          excelColumnIndex: 5,
          excelHeader: "Tax",
          sampleValue: "222.22",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "purchase_records.tax_val",
          parts: [],
        },
        {
          excelColumnIndex: 6,
          excelHeader: "HSN Code",
          sampleValue: "1234",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "hsn_codes.code",
          parts: [],
        },
      ];

      const result = await parseExcelToRows(file, mappings);

      expect(result[0].assessVal).toBe(1234.56);
      expect(result[0].taxVal).toBe(222.22);
    });

    test("should handle empty/whitespace numeric as null", async () => {
      const data = [
        [
          "Seller GSTIN",
          "Seller Name",
          "Buyer GSTIN",
          "Buyer Name",
          "Amount",
          "Tax",
          "HSN Code",
        ],
        [
          "29ABCDE1234F1Z5",
          "Test Seller",
          "27XYZAB5678G1H9",
          "Test Buyer",
          "1000.00",
          "  ",
          "1234",
        ],
      ];
      const buffer = createExcelBuffer(data);
      const file = createMockFile(
        buffer,
        "test.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );

      const mappings: Mapping[] = [
        {
          excelColumnIndex: 0,
          excelHeader: "Seller GSTIN",
          sampleValue: "29ABCDE1234F1Z5",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "seller_entity.gstin",
          parts: [],
        },
        {
          excelColumnIndex: 1,
          excelHeader: "Seller Name",
          sampleValue: "Test Seller",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "seller_entity.name",
          parts: [],
        },
        {
          excelColumnIndex: 2,
          excelHeader: "Buyer GSTIN",
          sampleValue: "27XYZAB5678G1H9",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "buyer_entity.gstin",
          parts: [],
        },
        {
          excelColumnIndex: 3,
          excelHeader: "Buyer Name",
          sampleValue: "Test Buyer",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "buyer_entity.name",
          parts: [],
        },
        {
          excelColumnIndex: 4,
          excelHeader: "Amount",
          sampleValue: "1000.00",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "purchase_records.assess_val",
          parts: [],
        },
        {
          excelColumnIndex: 5,
          excelHeader: "Tax",
          sampleValue: "  ",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "purchase_records.tax_val",
          parts: [],
        },
        {
          excelColumnIndex: 6,
          excelHeader: "HSN Code",
          sampleValue: "1234",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "hsn_codes.code",
          parts: [],
        },
      ];

      const result = await parseExcelToRows(file, mappings);

      expect(result[0].assessVal).toBe(1000.0);
      expect(result[0].taxVal).toBeNull();
    });

    test("should throw error for invalid numeric value", async () => {
      const data = [
        [
          "Seller GSTIN",
          "Seller Name",
          "Buyer GSTIN",
          "Buyer Name",
          "Amount",
          "HSN Code",
        ],
        [
          "29ABCDE1234F1Z5",
          "Test Seller",
          "27XYZAB5678G1H9",
          "Test Buyer",
          "not-a-number",
          "1234",
        ],
      ];
      const buffer = createExcelBuffer(data);
      const file = createMockFile(
        buffer,
        "test.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );

      const mappings: Mapping[] = [
        {
          excelColumnIndex: 0,
          excelHeader: "Seller GSTIN",
          sampleValue: "29ABCDE1234F1Z5",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "seller_entity.gstin",
          parts: [],
        },
        {
          excelColumnIndex: 1,
          excelHeader: "Seller Name",
          sampleValue: "Test Seller",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "seller_entity.name",
          parts: [],
        },
        {
          excelColumnIndex: 2,
          excelHeader: "Buyer GSTIN",
          sampleValue: "27XYZAB5678G1H9",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "buyer_entity.gstin",
          parts: [],
        },
        {
          excelColumnIndex: 3,
          excelHeader: "Buyer Name",
          sampleValue: "Test Buyer",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "buyer_entity.name",
          parts: [],
        },
        {
          excelColumnIndex: 4,
          excelHeader: "Amount",
          sampleValue: "not-a-number",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "purchase_records.assess_val",
          parts: [],
        },
        {
          excelColumnIndex: 5,
          excelHeader: "HSN Code",
          sampleValue: "1234",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "hsn_codes.code",
          parts: [],
        },
      ];

      await expect(parseExcelToRows(file, mappings)).rejects.toThrow(
        'Row 2: Invalid numeric value: "not-a-number"',
      );
    });
  });

  describe("Date Parsing", () => {
    test("should parse date with valid format", async () => {
      const data = [
        [
          "Seller GSTIN",
          "Seller Name",
          "Buyer GSTIN",
          "Buyer Name",
          "Amount",
          "HSN Code",
          "Invoice Date",
        ],
        [
          "29ABCDE1234F1Z5",
          "Test Seller",
          "27XYZAB5678G1H9",
          "Test Buyer",
          "1000.00",
          "1234",
          "01/15/2024",
        ],
      ];
      const buffer = createExcelBuffer(data);
      const file = createMockFile(
        buffer,
        "test.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );

      const mappings: Mapping[] = [
        {
          excelColumnIndex: 0,
          excelHeader: "Seller GSTIN",
          sampleValue: "29ABCDE1234F1Z5",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "seller_entity.gstin",
          parts: [],
        },
        {
          excelColumnIndex: 1,
          excelHeader: "Seller Name",
          sampleValue: "Test Seller",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "seller_entity.name",
          parts: [],
        },
        {
          excelColumnIndex: 2,
          excelHeader: "Buyer GSTIN",
          sampleValue: "27XYZAB5678G1H9",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "buyer_entity.gstin",
          parts: [],
        },
        {
          excelColumnIndex: 3,
          excelHeader: "Buyer Name",
          sampleValue: "Test Buyer",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "buyer_entity.name",
          parts: [],
        },
        {
          excelColumnIndex: 4,
          excelHeader: "Amount",
          sampleValue: "1000.00",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "purchase_records.assess_val",
          parts: [],
        },
        {
          excelColumnIndex: 5,
          excelHeader: "HSN Code",
          sampleValue: "1234",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "hsn_codes.code",
          parts: [],
        },
        {
          excelColumnIndex: 6,
          excelHeader: "Invoice Date",
          sampleValue: "01/15/2024",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "purchase_records.invoice_date",
          parts: [],
          dateFormat: "MM/dd/yyyy",
        },
      ];

      const result = await parseExcelToRows(file, mappings);

      expect(result[0].invoiceDate).toBeInstanceOf(Date);
      expect(result[0].invoiceDate?.getFullYear()).toBe(2024);
      expect(result[0].invoiceDate?.getMonth()).toBe(0); // January is 0
      expect(result[0].invoiceDate?.getDate()).toBe(15);
    });

    test("should throw error for date with invalid format", async () => {
      const data = [
        [
          "Seller GSTIN",
          "Seller Name",
          "Buyer GSTIN",
          "Buyer Name",
          "Amount",
          "HSN Code",
          "Invoice Date",
        ],
        [
          "29ABCDE1234F1Z5",
          "Test Seller",
          "27XYZAB5678G1H9",
          "Test Buyer",
          "1000.00",
          "1234",
          "invalid-date",
        ],
      ];
      const buffer = createExcelBuffer(data);
      const file = createMockFile(
        buffer,
        "test.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );

      const mappings: Mapping[] = [
        {
          excelColumnIndex: 0,
          excelHeader: "Seller GSTIN",
          sampleValue: "29ABCDE1234F1Z5",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "seller_entity.gstin",
          parts: [],
        },
        {
          excelColumnIndex: 1,
          excelHeader: "Seller Name",
          sampleValue: "Test Seller",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "seller_entity.name",
          parts: [],
        },
        {
          excelColumnIndex: 2,
          excelHeader: "Buyer GSTIN",
          sampleValue: "27XYZAB5678G1H9",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "buyer_entity.gstin",
          parts: [],
        },
        {
          excelColumnIndex: 3,
          excelHeader: "Buyer Name",
          sampleValue: "Test Buyer",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "buyer_entity.name",
          parts: [],
        },
        {
          excelColumnIndex: 4,
          excelHeader: "Amount",
          sampleValue: "1000.00",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "purchase_records.assess_val",
          parts: [],
        },
        {
          excelColumnIndex: 5,
          excelHeader: "HSN Code",
          sampleValue: "1234",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "hsn_codes.code",
          parts: [],
        },
        {
          excelColumnIndex: 6,
          excelHeader: "Invoice Date",
          sampleValue: "invalid-date",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "purchase_records.invoice_date",
          parts: [],
          dateFormat: "MM/dd/yyyy",
        },
      ];

      await expect(parseExcelToRows(file, mappings)).rejects.toThrow(
        'Row 2: Unable to parse date "invalid-date" with format "MM/dd/yyyy" for invoice date',
      );
    });

    test("should throw error for date field without format", async () => {
      const data = [
        [
          "Seller GSTIN",
          "Seller Name",
          "Buyer GSTIN",
          "Buyer Name",
          "Amount",
          "HSN Code",
          "Invoice Date",
        ],
        [
          "29ABCDE1234F1Z5",
          "Test Seller",
          "27XYZAB5678G1H9",
          "Test Buyer",
          "1000.00",
          "1234",
          "01/15/2024",
        ],
      ];
      const buffer = createExcelBuffer(data);
      const file = createMockFile(
        buffer,
        "test.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );

      const mappings: Mapping[] = [
        {
          excelColumnIndex: 0,
          excelHeader: "Seller GSTIN",
          sampleValue: "29ABCDE1234F1Z5",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "seller_entity.gstin",
          parts: [],
        },
        {
          excelColumnIndex: 1,
          excelHeader: "Seller Name",
          sampleValue: "Test Seller",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "seller_entity.name",
          parts: [],
        },
        {
          excelColumnIndex: 2,
          excelHeader: "Buyer GSTIN",
          sampleValue: "27XYZAB5678G1H9",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "buyer_entity.gstin",
          parts: [],
        },
        {
          excelColumnIndex: 3,
          excelHeader: "Buyer Name",
          sampleValue: "Test Buyer",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "buyer_entity.name",
          parts: [],
        },
        {
          excelColumnIndex: 4,
          excelHeader: "Amount",
          sampleValue: "1000.00",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "purchase_records.assess_val",
          parts: [],
        },
        {
          excelColumnIndex: 5,
          excelHeader: "HSN Code",
          sampleValue: "1234",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "hsn_codes.code",
          parts: [],
        },
        {
          excelColumnIndex: 6,
          excelHeader: "Invoice Date",
          sampleValue: "01/15/2024",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "purchase_records.invoice_date",
          parts: [],
        },
      ];

      await expect(parseExcelToRows(file, mappings)).rejects.toThrow(
        "Row 2: Date format not specified for invoice date",
      );
    });
  });

  describe("Split Column Parsing", () => {
    test("should parse split column with delimiter correctly", async () => {
      const data = [
        ["Combined", "Buyer GSTIN", "Buyer Name", "Amount", "HSN Code"],
        [
          "29ABCDE1234F1Z5|Test Seller",
          "27XYZAB5678G1H9",
          "Test Buyer",
          "1000.00",
          "1234",
        ],
      ];
      const buffer = createExcelBuffer(data);
      const file = createMockFile(
        buffer,
        "test.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );

      const mappings: Mapping[] = [
        {
          excelColumnIndex: 0,
          excelHeader: "Combined",
          sampleValue: "29ABCDE1234F1Z5|Test Seller",
          shouldSplit: true,
          delimiter: "|",
          mappedTo: null,
          parts: [
            {
              index: 0,
              name: "Seller GSTIN",
              mapTo: "seller_entity.gstin",
            },
            {
              index: 1,
              name: "Seller Name",
              mapTo: "seller_entity.name",
            },
          ],
        },
        {
          excelColumnIndex: 1,
          excelHeader: "Buyer GSTIN",
          sampleValue: "27XYZAB5678G1H9",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "buyer_entity.gstin",
          parts: [],
        },
        {
          excelColumnIndex: 2,
          excelHeader: "Buyer Name",
          sampleValue: "Test Buyer",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "buyer_entity.name",
          parts: [],
        },
        {
          excelColumnIndex: 3,
          excelHeader: "Amount",
          sampleValue: "1000.00",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "purchase_records.assess_val",
          parts: [],
        },
        {
          excelColumnIndex: 4,
          excelHeader: "HSN Code",
          sampleValue: "1234",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "hsn_codes.code",
          parts: [],
        },
      ];

      const result = await parseExcelToRows(file, mappings);

      expect(result[0].sellerGstin).toBe("29ABCDE1234F1Z5");
      expect(result[0].sellerName).toBe("Test Seller");
    });

    test("should handle split column with date part", async () => {
      const data = [
        ["Combined", "Buyer GSTIN", "Buyer Name", "Amount", "HSN Code"],
        [
          "INV001|01/15/2024",
          "29ABCDE1234F1Z5",
          "Test Seller",
          "27XYZAB5678G1H9",
          "Test Buyer",
          "1000.00",
          "1234",
        ],
      ];
      const buffer = createExcelBuffer(data);
      const file = createMockFile(
        buffer,
        "test.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );

      const mappings: Mapping[] = [
        {
          excelColumnIndex: 0,
          excelHeader: "Combined",
          sampleValue: "INV001|01/15/2024",
          shouldSplit: true,
          delimiter: "|",
          mappedTo: null,
          parts: [
            {
              index: 0,
              name: "Invoice No",
              mapTo: "purchase_records.invoice_no",
            },
            {
              index: 1,
              name: "Invoice Date",
              mapTo: "purchase_records.invoice_date",
              dateFormat: "MM/dd/yyyy",
            },
          ],
        },
        {
          excelColumnIndex: 1,
          excelHeader: "Seller GSTIN",
          sampleValue: "29ABCDE1234F1Z5",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "seller_entity.gstin",
          parts: [],
        },
        {
          excelColumnIndex: 2,
          excelHeader: "Seller Name",
          sampleValue: "Test Seller",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "seller_entity.name",
          parts: [],
        },
        {
          excelColumnIndex: 3,
          excelHeader: "Buyer GSTIN",
          sampleValue: "27XYZAB5678G1H9",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "buyer_entity.gstin",
          parts: [],
        },
        {
          excelColumnIndex: 4,
          excelHeader: "Buyer Name",
          sampleValue: "Test Buyer",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "buyer_entity.name",
          parts: [],
        },
        {
          excelColumnIndex: 5,
          excelHeader: "Amount",
          sampleValue: "1000.00",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "purchase_records.assess_val",
          parts: [],
        },
        {
          excelColumnIndex: 6,
          excelHeader: "HSN Code",
          sampleValue: "1234",
          shouldSplit: false,
          delimiter: null,
          mappedTo: "hsn_codes.code",
          parts: [],
        },
      ];

      const result = await parseExcelToRows(file, mappings);

      expect(result[0].invoiceNo).toBe("INV001");
      expect(result[0].invoiceDate).toBeInstanceOf(Date);
      expect(result[0].invoiceDate?.getFullYear()).toBe(2024);
    });
  });
});
