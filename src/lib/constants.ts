import { DbFieldMapping } from "../enums/db-field-mapping.enum";

export const MAX_EXCEL_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export const MANDATORY_FIELDS = [
  DbFieldMapping.SELLER_NAME,
  DbFieldMapping.SELLER_GSTIN,
  DbFieldMapping.BUYER_NAME,
  DbFieldMapping.BUYER_GSTIN,
  DbFieldMapping.PURCHASE_ASSESS_VAL,
  DbFieldMapping.HSN_CODE,
] as const;

export const DATE_FORMATS = [
  "yyyy-MM-dd",
  "dd/MM/yyyy",
  "MM/dd/yyyy",
  "dd-MM-yyyy",
  "MM-dd-yyyy",
  "yyyy/MM/dd",
  "dd.MM.yyyy",
  "MM.dd.yyyy",
  "dd MMM yyyy",
  "dd MMMM yyyy",
  "MMM dd, yyyy",
  "MMMM dd, yyyy",
  "dd-MMM-yyyy",
  "dd/MM/yy",
  "MM/dd/yy",
];

export const DATETIME_FORMATS = [
  "yyyy-MM-dd HH:mm:ss",
  "yyyy-MM-dd HH:mm",
  "dd/MM/yyyy HH:mm:ss",
  "dd/MM/yyyy HH:mm",
  "MM/dd/yyyy HH:mm:ss",
  "MM/dd/yyyy HH:mm",
  "dd-MM-yyyy HH:mm:ss",
  "dd-MM-yyyy HH:mm",
  "yyyy/MM/dd HH:mm:ss",
  "yyyy/MM/dd HH:mm",
  "dd.MM.yyyy HH:mm:ss",
  "dd.MM.yyyy HH:mm",
  "dd MMM yyyy HH:mm:ss",
  "dd MMM yyyy HH:mm",
  "dd MMMM yyyy HH:mm:ss",
  "dd MMMM yyyy HH:mm",
  "MMM dd, yyyy HH:mm:ss",
  "MMM dd, yyyy HH:mm",
  "MMMM dd, yyyy HH:mm:ss",
  "MMMM dd, yyyy HH:mm",
];
