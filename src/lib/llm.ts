import OpenAI from "openai";
import { z } from "zod";
import { config } from "./config";
import { AppError, BadGatewayError, ServiceUnavailableError } from "./errors";
import { loggerWithContext } from "./logger";

const LlmSuggestionSchema = z.object({
  should_split: z.boolean(),
  delimiter: z.string().nullable(),
  map_to: z.string().nullable(),
  parts: z
    .array(
      z.object({
        index: z.number().int().nonnegative(),
        name: z.string(),
        map_to: z.string().nullable(),
      }),
    )
    .default([]),
});

export type LlmSuggestion = z.infer<typeof LlmSuggestionSchema>;

const LlmBatchSuggestionSchema = z.object({
  columns: z.array(
    z.object({
      header: z.string(),
      should_split: z.boolean(),
      delimiter: z.string().nullable(),
      map_to: z.string().nullable(),
      parts: z
        .array(
          z.object({
            index: z.number().int().nonnegative(),
            name: z.string(),
            map_to: z.string().nullable(),
          }),
        )
        .default([]),
    }),
  ),
});

export type LlmBatchSuggestion = z.infer<typeof LlmBatchSuggestionSchema>;

export type ColumnSample = {
  header: string;
  sampleValue: string;
};

const DEFAULT_TIMEOUT_MS = 60000;

export const openaiClient = {
  instance: null as OpenAI | null,
  get(): OpenAI {
    if (!this.instance) {
      this.instance = new OpenAI({
        apiKey: "local-llamafile",
        baseURL: `${config.llm.url}/v1`,
        timeout: DEFAULT_TIMEOUT_MS,
      });
    }
    return this.instance;
  },
  set(mock: OpenAI | null) {
    this.instance = mock;
  },
};

const SINGLE_MAPPING_SYSTEM_PROMPT = `You are an expert data mapper. Your task is to analyze Excel columns and decide how to map them to database columns.

CRITICAL: Respond immediately with JSON only. DO NOT use <think> tags or show your reasoning process.

Your response must be valid JSON in this format:
{
  "should_split": boolean,
  "delimiter": string or null,
  "map_to": string or null,
  "parts": [
    { "index": 0, "name": "Part Name", "map_to": "db_column_name" }
  ]
}

Available Database Columns:
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
- hsn_codes.chemical_name (product/chemical name)

Guidelines:
1. If the column header or sample value contains a clear delimiter (/, -, |, :), split it
2. Map seller-related columns to seller_entity.* fields
3. Map buyer-related columns to buyer_entity.* fields
4. Map product/item columns to hsn_codes.* fields
5. Map invoice/transaction columns to purchase_records.* fields
6. If no suitable database column exists, set map_to to null
7. If column should not be split, map directly or set map_to to null
8. Return ONLY valid JSON, no extra text, no explanations
9. Co-occurrence rule (important): Certain database fields commonly appear together in a single Excel column separated by a delimiter.
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

const BATCH_MAPPING_SYSTEM_PROMPT = `You are an expert data mapper. Your task is to analyze Excel columns and decide how to map them to database columns.

CRITICAL: Respond immediately with JSON only. DO NOT use <think> tags or show your reasoning process.

Your response must be valid JSON in this format:
{
  "columns": [
    {
      "header": "column_header_name",
      "should_split": boolean,
      "delimiter": string or null,
      "map_to": string or null,
      "parts": [
        { "index": 0, "name": "Part Name", "map_to": "db_column_name" }
      ]
    }
  ]
}

Available Database Columns:
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
- hsn_codes.chemical_name (product/chemical name)

Guidelines:
1. If the column header or sample value contains a clear delimiter (/, -, |, :), split it
2. Map seller-related columns to seller_entity.* fields
3. Map buyer-related columns to buyer_entity.* fields
4. Map product/item columns to hsn_codes.* fields
5. Map invoice/transaction columns to purchase_records.* fields
6. If no suitable database column exists, set map_to to null
7. If column should not be split, map directly or set map_to to null
8. Return ONLY valid JSON, no extra text, no explanations
9. The "header" field in each column object must match exactly the header from the input
10. One availbale database column should not be mapped twice
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

function buildUserPrompt(sample: ColumnSample, dbColumns: string[]) {
  const dbList = dbColumns.join(", ");
  return `Input:
    Column Header: "${sample.header}"
    Sample Value: "${sample.sampleValue}"
    Available DB Columns: ${dbList}`;
}

function buildBatchUserPrompt(samples: ColumnSample[], dbColumns: string[]) {
  const dbList = dbColumns.join(", ");
  const columnsJson = JSON.stringify(
    samples.map((s) => ({
      header: s.header,
      sample_value: s.sampleValue,
    })),
    null,
    2,
  );

  return `Input Columns:
    ${columnsJson}

    Available DB Columns: ${dbList}`;
}

function extractContent(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    throw BadGatewayError("LLM response was not a JSON object");
  }

  const record = payload as Record<string, unknown>;
  if (typeof record.content === "string") {
    return removeThink(record.content);
  }

  const choices = record.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const first = choices[0] as Record<string, unknown>;
    const message = first?.message as Record<string, unknown> | undefined;
    if (message && typeof message.content === "string") {
      return removeThink(message.content);
    }
    if (typeof first?.text === "string") {
      return first.text;
    }
  }

  throw BadGatewayError("LLM response did not include content text");
}

function removeThink(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

export async function requestCompletion(
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  try {
    const client = openaiClient.get();
    const response = await client.chat.completions.create({
      model: "Qwen3-8B-Q4_K_M.gguf",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.1,
    });
    loggerWithContext.info(
      { response: JSON.stringify(response) },
      "Response from LLM",
    );
    return extractContent(response);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT")
    ) {
      throw new AppError("LLM request timed out", 504, "LLM_TIMEOUT");
    }
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND")
    ) {
      throw ServiceUnavailableError("Failed to reach LLM endpoint");
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new AppError("LLM request timed out", 504, "LLM_TIMEOUT");
    }
    throw ServiceUnavailableError("Failed to reach LLM endpoint");
  }
}

export async function getMappingSuggestion(
  sample: ColumnSample,
  dbColumns: string[],
): Promise<LlmSuggestion> {
  const userPrompt = buildUserPrompt(sample, dbColumns);
  loggerWithContext.info({ userPrompt }, "User prompt for mapping suggestion");
  const content = await requestCompletion(
    SINGLE_MAPPING_SYSTEM_PROMPT,
    userPrompt,
  );
  loggerWithContext.info({ content }, "Mapping suggestion from LLM");

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw BadGatewayError("LLM returned malformed JSON");
  }

  const result = LlmSuggestionSchema.safeParse(parsed);
  if (!result.success) {
    throw BadGatewayError("LLM JSON did not match schema");
  }

  return result.data;
}

export async function getBatchMappingSuggestions(
  samples: ColumnSample[],
  dbColumns: string[],
): Promise<LlmBatchSuggestion> {
  const userPrompt = buildBatchUserPrompt(samples, dbColumns);
  loggerWithContext.info(
    { userPrompt },
    "User prompt for batch mapping suggestions",
  );
  const content = await requestCompletion(
    BATCH_MAPPING_SYSTEM_PROMPT,
    userPrompt,
  );
  loggerWithContext.info({ content }, "Mapping suggestions from LLM");

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw BadGatewayError("LLM returned malformed JSON");
  }

  const result = LlmBatchSuggestionSchema.safeParse(parsed);
  if (!result.success) {
    throw BadGatewayError("LLM JSON did not match schema");
  }

  return result.data;
}
