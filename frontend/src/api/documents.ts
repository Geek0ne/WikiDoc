import { request } from './client';
import type {
  AclEntryInput,
  AclEntryView,
  Document,
  DocumentDetail,
  TrashItem,
  VersionContent,
  VersionRow,
  Visibility,
} from '../types/api';

export async function getDocument(id: number): Promise<DocumentDetail> {
  return request<DocumentDetail>(`/api/documents/${id}`);
}

export interface CreateDocInput {
  space_id: number;
  parent_id?: number | null;
  title?: string;
  content_md?: string;
  visibility?: Visibility;
  status?: 'draft' | 'published' | 'archived';
}

export async function createDocument(input: CreateDocInput): Promise<{ doc: Document }> {
  return request<{ doc: Document }>('/api/documents', { method: 'POST', body: input });
}

export interface UpdateDocInput {
  title?: string;
  content_md?: string;
  visibility?: Visibility;
  status?: 'draft' | 'published' | 'archived';
  change_note?: string | null;
}

export async function updateDocument(id: number, input: UpdateDocInput): Promise<{ doc: Document }> {
  return request<{ doc: Document }>(`/api/documents/${id}`, { method: 'PUT', body: input });
}

/** 移入回收站（permanent=false）或彻底删除（permanent=true） */
export async function deleteDocument(id: number, permanent: boolean): Promise<null> {
  const suffix = permanent ? '?permanent=1' : '';
  return request<null>(`/api/documents/${id}${suffix}`, { method: 'DELETE' });
}

export async function restoreDocument(id: number): Promise<null> {
  return request<null>(`/api/documents/${id}/restore`, { method: 'POST' });
}

export async function listTrash(): Promise<{ items: TrashItem[] }> {
  return request<{ items: TrashItem[] }>('/api/documents/trash');
}

export async function listVersions(docId: number): Promise<{ items: VersionRow[] }> {
  return request<{ items: VersionRow[] }>(`/api/documents/${docId}/versions`);
}

export async function getVersionContent(
  docId: number,
  version: number
): Promise<VersionContent> {
  return request<VersionContent>(`/api/documents/${docId}/versions/${version}`);
}

export async function restoreVersion(docId: number, version: number): Promise<{ doc: Document }> {
  return request<{ doc: Document }>(`/api/documents/${docId}/versions/${version}/restore`, {
    method: 'POST',
  });
}

export async function listDocAcl(docId: number): Promise<{ entries: AclEntryView[] }> {
  return request<{ entries: AclEntryView[] }>(`/api/documents/${docId}/acl`);
}

export async function replaceDocAcl(
  docId: number,
  entries: AclEntryInput[]
): Promise<{ count: number }> {
  return request<{ count: number }>(`/api/documents/${docId}/acl`, {
    method: 'PUT',
    body: { entries },
  });
}

/** 上报浏览记录（最近文档列表的数据来源） */
export async function recordView(docId: number): Promise<null> {
  return request<null>(`/api/documents/${docId}/view`, { method: 'POST' });
}

export async function toggleFavorite(docId: number): Promise<{ favorited: boolean }> {
  return request<{ favorited: boolean }>(`/api/documents/${docId}/favorite`, { method: 'POST' });
}

export async function listFavorites(): Promise<{ items: Document[] }> {
  return request<{ items: Document[] }>('/api/favorites');
}

export async function listRecent(): Promise<{ items: Document[] }> {
  return request<{ items: Document[] }>('/api/recent');
}
