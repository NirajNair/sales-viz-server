import OpenAI from "openai";
import { config } from "../config";
import { AppError, BadGatewayError, ServiceUnavailableError } from "../errors";
import { loggerWithContext } from "../logger";

const DEFAULT_TIMEOUT_MS =  5 * 60 * 1000;

export const openaiClient = {
  instance: null as OpenAI | null,
  get(): OpenAI {
    if (!this.instance) {
      this.instance = new OpenAI({
        apiKey: "local-llamafile",
        baseURL: `${config.llm.url}/v1`,
      });
    }
    return this.instance;
  },
  set(mock: OpenAI | null) {
    this.instance = mock;
  },
};

export function extractContent(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    throw BadGatewayError("LLM response was not a JSON object");
  }

  const record = payload as Record<string, unknown>;
  if (typeof record.content === "string") {
    return cleanLlmResponse(record.content);
  }

  const choices = record.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const first = choices[0] as Record<string, unknown>;
    const message = first?.message as Record<string, unknown> | undefined;
    if (message && typeof message.content === "string") {
      return cleanLlmResponse(message.content);
    }
    if (typeof first?.text === "string") {
      return first.text;
    }
  }

  throw BadGatewayError("LLM response did not include content text");
}

export function cleanLlmResponse(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .replace(/<\|[^|]+\|>/g, "")
    .trim();
}

export async function requestCompletion(
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const client = openaiClient.get();
    const response = await client.chat.completions.create(
      {
        model: "Qwen3-8B-Q4_K_M.gguf",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.1,
        response_format: { type: "json_object" },
      },
      { signal: controller.signal },
    );
    loggerWithContext.info(
      { response: JSON.stringify(response) },
      "Response from LLM",
    );
    clearTimeout(timeoutId);
    return extractContent(response);
  } catch (error) {
    clearTimeout(timeoutId);
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
