import { isValid, parse } from "date-fns";

/**
 * Parses a date string using a specific format.
 * Returns the parsed Date object or null if parsing fails.
 * No fallback - strict parsing only.
 */
export function parseDateWithFormat(
  value: string,
  format: string,
): Date | null {
  const trimmedValue = value.trim();
  if (!trimmedValue) return null;

  const parsed = parse(trimmedValue, format, new Date());
  if (isValid(parsed)) {
    return parsed;
  }

  return null;
}
