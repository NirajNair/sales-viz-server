import { z } from "zod";

export const LlmSuggestionSchema = z.object({
  should_split: z.boolean(),
  delimiter: z.string().nullable(),
  map_to: z.string().nullable(),
  parts: z
    .array(
      z.object({
        index: z.number().int().nonnegative(),
        map_to: z.string().nullable(),
      }),
    )
    .default([]),
});

export type LlmSuggestion = z.infer<typeof LlmSuggestionSchema>;

export const LlmBatchSuggestionSchema = z.object({
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
