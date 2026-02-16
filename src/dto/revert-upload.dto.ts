import { z } from "zod";
import { validateWithZod } from "../lib/validation";

export const RevertUploadParamsSchema = z.object({
  uploadId: z.string().uuid({ message: "Invalid upload ID format" }),
});

export interface RevertUploadResponseDto {
  deletedRecordsCount: number;
}

/**
 * Validates the revert upload request parameters.
 */
export function validateRevertUploadParams(params: Record<string, string>): {
  uploadId: string;
} {
  return validateWithZod(RevertUploadParamsSchema, params);
}
