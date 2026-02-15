import { DbFields } from "../enums/db-fields.enum";

export const MAX_EXCEL_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export const MANDATORY_FIELDS = [
  DbFields.SELLER_NAME,
  DbFields.SELLER_GSTIN,
  DbFields.BUYER_NAME,
  DbFields.BUYER_GSTIN,
  DbFields.PURCHASE_ASSESS_VAL,
  DbFields.HSN_CODE,
] as const;
