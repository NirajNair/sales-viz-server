import { eq } from "drizzle-orm";
import type { Context } from "elysia";
import { db } from "../db";
import { purchaseRecords, uploads } from "../db/schema";
import type { RevertUploadResponseDto } from "../dto/revert-upload.dto";
import { validateRevertUploadParams } from "../dto/revert-upload.dto";
import { ValidationError } from "../lib/errors";
import { loggerWithContext } from "../lib/logger";

export type RevertUploadDependencies = {
  db: typeof db;
  loggerWithContext: Pick<typeof loggerWithContext, "error" | "info">;
};

export function createHandleRevertUpload(deps: RevertUploadDependencies) {
  return async function handleRevertUpload({
    params,
  }: Context): Promise<RevertUploadResponseDto> {
    const validatedParams = validateRevertUploadParams(params);
    const uploadId = validatedParams.uploadId;

    // Check if upload exists
    const uploadResult = await deps.db
      .select()
      .from(uploads)
      .where(eq(uploads.id, uploadId))
      .limit(1);

    if (uploadResult.length === 0) {
      throw ValidationError(`Upload with ID "${uploadId}" not found`);
    }

    const upload = uploadResult[0];
    if (upload.reverted) {
      throw ValidationError("Upload has already been reverted");
    }

    const [purchaseRecordsResult] = await deps.db.transaction(async (tx) => {
      return Promise.all([
        tx
          .delete(purchaseRecords)
          .where(eq(purchaseRecords.uploadId, uploadId)),
        tx
          .update(uploads)
          .set({ reverted: true })
          .where(eq(uploads.id, uploadId)),
      ]);
    });

    const purchaseRecordsCount = purchaseRecordsResult.rowCount ?? 0;

    deps.loggerWithContext.info(
      {
        uploadId,
        purchaseRecordsDeletedCount: purchaseRecordsCount,
      },
      "Upload reverted successfully",
    );

    return { deletedRecordsCount: purchaseRecordsCount };
  };
}

export const handleRevertUpload = createHandleRevertUpload({
  db,
  loggerWithContext,
});
