/**
 * src/api/uploads.ts
 *
 * Replaces `base44.integrations.Core.UploadFile({ file })`. Used by
 * TradeForm.jsx for trade screenshot uploads.
 *
 * BACKEND CONTRACT ASSUMED:
 *   POST /uploads   multipart/form-data, field name "file"
 *                   -> { file_url: string }
 */
import { apiClient } from "@/api/client";

export interface UploadFileResponse {
  file_url: string;
}

export async function uploadFile(file: File): Promise<UploadFileResponse> {
  const formData = new FormData();
  formData.append("file", file);
  return apiClient.post<UploadFileResponse>("/uploads", formData);
}
