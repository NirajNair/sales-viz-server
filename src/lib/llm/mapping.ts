import { BadGatewayError } from "../errors";
import { loggerWithContext } from "../logger";
import { requestCompletion } from "./index";
import {
  BATCH_MAPPING_SYSTEM_PROMPT,
  SINGLE_MAPPING_SYSTEM_PROMPT,
} from "./prompts";
import {
  LlmBatchSuggestionSchema,
  LlmSuggestionSchema,
  type ColumnSample,
  type LlmBatchSuggestion,
  type LlmSuggestion,
} from "./types";

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
