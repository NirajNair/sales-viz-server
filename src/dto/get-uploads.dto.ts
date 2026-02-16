export interface UploadDto {
  uploadId: string;
  fileName: string;
  fileSize: number;
  reverted: boolean;
  createdAt: Date;
}

export interface GetUploadsResponseDto {
  uploads: UploadDto[];
}
