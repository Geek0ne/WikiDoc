import { request } from './client';
import type { ImportJob } from '../types/api';

export async function listImportJobs(): Promise<{ items: ImportJob[] }> {
  return request<{ items: ImportJob[] }>('/api/import/jobs');
}

export async function getImportJob(jobNo: string): Promise<{ job: ImportJob }> {
  return request<{ job: ImportJob }>(`/api/import/jobs/${encodeURIComponent(jobNo)}`);
}

/**
 * 提交导入任务。字段名与后端 upload.single('file') 及 body 解析对齐：
 * target_space_id 必填，parent_id 可选，status 缺省 published。
 */
export async function submitImport(input: {
  file: File;
  target_space_id: number;
  parent_id?: number | null;
  status?: 'draft' | 'published';
}): Promise<{ job: ImportJob }> {
  const fd = new FormData();
  fd.append('file', input.file);
  fd.append('target_space_id', String(input.target_space_id));
  if (input.parent_id !== null && input.parent_id !== undefined) {
    fd.append('parent_id', String(input.parent_id));
  }
  if (input.status) fd.append('status', input.status);
  return request<{ job: ImportJob }>('/api/import', { method: 'POST', formData: fd });
}
