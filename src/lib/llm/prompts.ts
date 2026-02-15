const SINGLE_RESPONSE_FORMAT = `Your response must be valid JSON in this format:
{
  "should_split": boolean,
  "delimiter": string or null,
  "map_to": string or null,
  "parts": [
    { "index": 0, "map_to": "db_column_name" }
  ]
}`;

const BATCH_RESPONSE_FORMAT = `Your response must be valid JSON in this format:
{
  "columns": [
    {
      "header": "column_header_name",
      "should_split": boolean,
      "delimiter": string or null,
      "map_to": string or null,
      "parts": [
        { "index": 0, "map_to": "db_column_name" }
      ]
    }
  ]
}`;

const DB_COLUMNS_LIST = `Available Database Columns:
- purchase_records.invoice_no
- purchase_records.invoice_date
- purchase_records.state
- purchase_records.ewb_no
- purchase_records.ewb_date
- purchase_records.assess_val
- purchase_records.tax_val
- seller_entity.name (seller organization name)
- seller_entity.gstin (seller GST identification number)
- seller_entity.place (seller location/city)
- seller_entity.pin (seller PIN code)
- buyer_entity.name (buyer organization name)
- buyer_entity.gstin (buyer GST identification number)
- buyer_entity.place (buyer location/city)
- buyer_entity.pin (buyer PIN code)
- hsn_codes.code (HSN/SAC code)
- hsn_codes.chemical_name (product/chemical name)`;

const MAPPING_GUIDELINES = `Guidelines:
1. CRITICAL - Delimiter Detection: Analyze each column's sample_value carefully to identify the EXACT delimiter used. 
    The delimiter must be the exact substring that separates the two parts, including any surrounding spaces.
    - Example: "ABC / XYZ" has delimiter " / " (with spaces), NOT "/"
    - Example: "4 - 30/08/2024" has delimiter " - " (with spaces)
    - Example: "ID-123" has delimiter "-" (no spaces)
    - The delimiter must actually split the sample_value into the parts you're mapping
2. CRITICAL - UNIQUENESS CONSTRAINT: Each database column can be mapped AT MOST ONCE across all columns. 
    - Once a database column is assigned to any header (via map_to or parts[*].map_to), it CANNOT be used again
    - Example: If "purchase_records.ewb_no" is mapped to "EWB No." column, it must NOT be mapped to "EWB No. & Dt." column
    - Example: If "seller_entity.gstin" is mapped to "From GSTIN & Name" column's parts, it must NOT be mapped elsewhere
    - If a column header appears to need a database column that's already mapped, set its map_to to null or choose an alternative
3. Map seller-related columns to seller_entity.* fields
4. Map buyer-related columns to buyer_entity.* fields
5. Map product/item columns to hsn_codes.* fields
6. Map invoice/transaction columns to purchase_records.* fields
7. If no suitable database column exists, set map_to to null
8. If column should not be split, map directly or set map_to to null
9. Return ONLY valid JSON, no extra text, no explanations
10. The "header" field in each column object must match exactly the header from the input
11. Co-occurrence rule (important): Certain database fields commonly appear together in a single Excel column separated by a delimiter.
    If one field from a known pair is identified in a column, assume a high probability that the paired field is also present in the same column.
    In such cases, prefer splitting the column and mapping each part to its respective paired database column when the data pattern supports it.

Known pairs:
- purchase_records.invoice_no + purchase_records.invoice_date
- purchase_records.ewb_no + purchase_records.ewb_date
- seller_entity.name + seller_entity.gstin
- seller_entity.place + seller_entity.pin
- buyer_entity.name + buyer_entity.gstin
- buyer_entity.place + buyer_entity.pin
- hsn_codes.code + hsn_codes.chemical_name`;

const BASE_SYSTEM_PROMPT_TEMPLATE = `You are an expert data mapper. Your task is to analyze Excel columns and decide how to map them to database columns.

CRITICAL: Respond immediately with JSON only. DO NOT use <think> tags or show your reasoning process.

{{RESPONSE_FORMAT}}

${DB_COLUMNS_LIST}

${MAPPING_GUIDELINES}`;

export const SINGLE_MAPPING_SYSTEM_PROMPT = BASE_SYSTEM_PROMPT_TEMPLATE.replace(
  "{{RESPONSE_FORMAT}}",
  SINGLE_RESPONSE_FORMAT,
);

export const BATCH_MAPPING_SYSTEM_PROMPT = BASE_SYSTEM_PROMPT_TEMPLATE.replace(
  "{{RESPONSE_FORMAT}}",
  BATCH_RESPONSE_FORMAT,
);
