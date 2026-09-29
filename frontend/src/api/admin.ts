import { request } from './client';
import type { AuditLogRow, Paged } from '../types/api';

export async function listAuditLogs(params: {
  page?: number;
  limit?: number;
  action?: string;
  user_id?: number;
  keyword?: string;
}): Promise<Paged<AuditLogRow>> {
  const qs = new URLSearchParams();
  qs.set('page', String(params.page ?? 1));
  qs.set('limit', String(params.limit ?? 20));
  if (params.action) qs.set('action', params.action);
  if (params.user_id !== undefined) qs.set('user_id', String(params.user_id));
  if (params.keyword) qs.set('keyword', params.keyword);
  return request<Paged<AuditLogRow>>(`/api/admin/audit?${qs.toString()}`);
}

export async function listAuditActions(): Promise<{ items: string[] }> {
  return request<{ items: string[] }>('/api/admin/audit/actions');
}

export async function getStats(): Promise<{
  users: number;
  groups: number;
  spaces: number;
  documents: number;
  attachments: number;
  attachmentBytes: number;
  auditLogs: number;
}> {
  return request('/api/admin/stats');
}

export async function rebuildPermissions(): Promise<{
  documents: number;
  entries: number;
  elapsedMs: number;
}> {
  return request('/api/admin/permissions/rebuild', { method: 'POST' });
}

export async function createBackup(): Promise<{ file: string | null; size?: number }> {
  return request('/api/admin/backup', { method: 'POST' });
}

export async function listBackups(): Promise<{
  items: { file: string; size: number; created_at: string }[];
}> {
  return request('/api/admin/backups');
}
