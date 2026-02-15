import { isValid, parse } from "date-fns";
import { DATE_FORMATS, DATETIME_FORMATS } from "./constants";

/**
 * Attempts to parse a date string using various common formats.
 * Returns the parsed Date object or null if parsing fails.
 */
export function parseDate(value: string): Date | null {
  const trimmedValue = value.trim();
  if (!trimmedValue) return null;

  for (const format of DATE_FORMATS) {
    const parsed = parse(trimmedValue, format, new Date());
    if (isValid(parsed)) {
      return parsed;
    }
  }

  const autoParsed = new Date(trimmedValue);
  if (isValid(autoParsed)) {
    return autoParsed;
  }

  return null;
}

/**
 * Attempts to parse a datetime string using various common formats.
 * Returns the parsed Date object or null if parsing fails.
 */
export function parseDateTime(value: string): Date | null {
  const trimmedValue = value.trim();
  if (!trimmedValue) return null;

  for (const format of DATETIME_FORMATS) {
    const parsed = parse(trimmedValue, format, new Date());
    if (isValid(parsed)) {
      return parsed;
    }
  }

  const autoParsed = new Date(trimmedValue);
  if (isValid(autoParsed)) {
    return autoParsed;
  }

  return null;
}

/**
 * Attempts to parse a value as either date or datetime.
 * Tries datetime formats first, then falls back to date-only formats.
 */
export function parseAnyDate(value: string): Date | null {
  const trimmedValue = value.trim();
  if (!trimmedValue) return null;

  const dateTimeResult = parseDateTime(trimmedValue);
  if (dateTimeResult) {
    return dateTimeResult;
  }

  return parseDate(trimmedValue);
}
