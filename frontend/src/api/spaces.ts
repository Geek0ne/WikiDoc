import { request } from './client';
import type { AclEntryInput, AclEntryView, DocTreeNode, Space, Visibility } from '../types/api';

export async function listSpaces(): Promise<{ items: Space[] }> {
  return request<{ items: Space[] }>('/api/spaces');
}

export async function getSpace(key: string): Promise<Space> {
  return request<Space>(`/api/spaces/${encodeURIComponent(key)}`);
}

export interface CreateSpaceInput {
  key: string;
  name: string;
  description?: string;
  visibility?: Visibility;
}

export async function createSpace(input: CreateSpaceInput): Promise<{ space: Space }> {
  return request<{ space: Space }>('/api/spaces', { method: 'POST', body: input });
}

export interface UpdateSpaceInput {
  name?: string;
  description?: string | null;
  visibility?: Visibility;
}

export async function updateSpace(id: number, input: UpdateSpaceInput): Promise<{ space: Space }> {
  return request<{ space: Space }>(`/api/spaces/${id}`, { method: 'PUT', body: input });
}

export async function deleteSpace(id: number): Promise<null> {
  return request<null>(`/api/spaces/${id}`, { method: 'DELETE' });
}

export async function getDocTree(spaceId: number): Promise<{ tree: DocTreeNode[] }> {
  return request<{ tree: DocTreeNode[] }>(`/api/spaces/${spaceId}/tree`);
}

export async function listSpaceAcl(spaceId: number): Promise<{ entries: AclEntryView[] }> {
  return request<{ entries: AclEntryView[] }>(`/api/spaces/${spaceId}/acl`);
}

export async function replaceSpaceAcl(
  spaceId: number,
  entries: AclEntryInput[]
): Promise<{ count: number }> {
  return request<{ count: number }>(`/api/spaces/${spaceId}/acl`, {
    method: 'PUT',
    body: { entries },
  });
}
