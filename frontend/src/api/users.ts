import { request } from './client';
import type { AdminUserRow, Group, GroupMember } from '../types/api';

/** 用户管理（全部需要管理员） */

export interface ListUsersParams {
  keyword?: string;
  source?: string;
  active?: number;
  page?: number;
  limit?: number;
}

export async function listUsers(
  params: ListUsersParams = {}
): Promise<{
  items: AdminUserRow[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}> {
  const qs = new URLSearchParams();
  if (params.keyword) qs.set('keyword', params.keyword);
  if (params.source) qs.set('source', params.source);
  if (params.active !== undefined) qs.set('active', String(params.active));
  qs.set('page', String(params.page ?? 1));
  qs.set('limit', String(params.limit ?? 20));
  return request(`/api/users?${qs.toString()}`);
}

export async function createUser(input: {
  username: string;
  display_name?: string;
  email?: string;
  password: string;
  is_admin?: number;
}): Promise<{ user: AdminUserRow }> {
  return request<{ user: AdminUserRow }>('/api/users', { method: 'POST', body: input });
}

export async function updateUser(
  id: number,
  input: {
    display_name?: string;
    email?: string | null;
    is_admin?: number;
    is_active?: number;
    password?: string;
  }
): Promise<{ user: AdminUserRow }> {
  return request<{ user: AdminUserRow }>(`/api/users/${id}`, { method: 'PUT', body: input });
}

export async function deactivateUser(id: number): Promise<null> {
  return request<null>(`/api/users/${id}`, { method: 'DELETE' });
}

export async function setUserGroups(id: number, groupIds: number[]): Promise<null> {
  return request<null>(`/api/users/${id}/groups`, { method: 'PUT', body: { groupIds } });
}

/** 用户组（列表对全员开放，写操作需管理员） */

export async function listGroups(keyword?: string): Promise<{ items: Group[] }> {
  const qs = keyword ? `?keyword=${encodeURIComponent(keyword)}` : '';
  return request<{ items: Group[] }>(`/api/groups${qs}`);
}

export async function getGroupMembers(id: number): Promise<{ items: GroupMember[] }> {
  return request<{ items: GroupMember[] }>(`/api/groups/${id}/members`);
}

export async function createGroup(input: {
  name: string;
  description?: string;
}): Promise<Group> {
  return request<Group>('/api/groups', { method: 'POST', body: input });
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

export async function syncLdapGroups(): Promise<unknown> {
  return request<unknown>('/api/groups/sync', { method: 'POST' });
}
