import { request } from './client';
import type { Group, GroupMember, GroupSyncResult } from '../types/api';

/** 用户组：列表对所有登录用户开放（权限编辑器选组用），增删改与同步仅管理员 */

export async function listGroups(keyword?: string): Promise<{ items: Group[] }> {
  const qs = keyword ? `?keyword=${encodeURIComponent(keyword)}` : '';
  return request<{ items: Group[] }>(`/api/groups${qs}`);
}

export async function listGroupMembers(id: number): Promise<{ items: GroupMember[] }> {
  return request<{ items: GroupMember[] }>(`/api/groups/${id}/members`);
}

export async function createGroup(input: { name: string; description?: string | null }): Promise<{ id: number }> {
  return request<{ id: number }>('/api/groups', { method: 'POST', body: input });
}

export async function updateGroup(id: number, input: { name?: string; description?: string | null }): Promise<null> {
  return request<null>(`/api/groups/${id}`, { method: 'PUT', body: input });
}

export async function deleteGroup(id: number): Promise<null> {
  return request<null>(`/api/groups/${id}`, { method: 'DELETE' });
}

export async function setGroupMembers(id: number, userIds: number[]): Promise<null> {
  return request<null>(`/api/groups/${id}/members`, { method: 'PUT', body: { userIds } });
}

export async function syncGroupsFromLdap(): Promise<GroupSyncResult> {
  return request<GroupSyncResult>('/api/groups/sync', { method: 'POST' });
}
