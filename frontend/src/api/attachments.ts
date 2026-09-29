import { request } from './client';
import type { Attachment } from '../types/api';

export async function listAttachments(documentId: number): Promise<{ items: Attachment[] }> {
  return request<{ items: Attachment[] }>(`/api/attachments?document_id=${documentId}`);
}

export async function uploadAttachment(
  file: File,
  documentId: number
): Promise<{ attachment: Attachment }> {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('document_id', String(documentId));
  return request<{ attachment: Attachment }>('/api/attachments', {
    method: 'POST',
    formData: fd,
  });
}

export async function deleteAttachment(id: number): Promise<null> {
  return request<null>(`/api/attachments/${id}`, { method: 'DELETE' });
}

/** 附件原始内容端点（图片直接以 <img src> 引用；下载用 requestBlob） */
export function attachmentRawUrl(id: number): string {
  return `/api/attachments/${id}/raw`;
}
