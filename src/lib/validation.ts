import { z } from "zod";
import { ValidationError } from "./errors";

/**
 * Validates data against a Zod schema and throws ValidationError on failure
 * Returns the first error message only (current behavior)
 */
export function validateWithZod<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const message = result.error.issues[0]?.message ?? "Validation failed";
    throw ValidationError(message);
  }
  return result.data;
}
