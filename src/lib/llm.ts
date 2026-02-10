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

const DEFAULT_TIMEOUT_MS = 30000;

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

const SINGLE_SYSTEM_PROMPT = `You are an expert data mapper. Your task is to analyze Excel columns and decide how to map them to database columns.
  
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

  Rules:
  1. If the column header or sample value contains a clear delimiter (/, -, |, :), split it
  2. Map each part to the most similar database column
  3. If no suitable database column exists, set map_to to null
  4. If column should not be split, map directly or set map_to to null
  5. Return ONLY valid JSON, no extra text, no explanations`;

const BATCH_SYSTEM_PROMPT = `You are an expert data mapper. Your task is to analyze Excel columns and decide how to map them to database columns.
  
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

  Rules:
  1. If the column header or sample value contains a clear delimiter (/, -, |, :), split it
  2. Map each part to the most similar database column
  3. If no suitable database column exists, set map_to to null
  4. If column should not be split, map directly or set map_to to null
  5. Return ONLY valid JSON, no extra text, no explanations
  6. The "header" field in each column object must match exactly the header from the input`;

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
  const content = await requestCompletion(SINGLE_SYSTEM_PROMPT, userPrompt);
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
  const content = await requestCompletion(BATCH_SYSTEM_PROMPT, userPrompt);
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
