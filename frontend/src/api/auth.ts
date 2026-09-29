import { request } from './client';
import type { LoginProviders, SafeUser, SitePublicSettings } from '../types/api';

/** 登录方式清单（登录页据此渲染按钮） */
export async function getProviders(): Promise<LoginProviders> {
  return request<LoginProviders>('/api/auth/providers');
}

/** 站点公开设置（站名、语言、登录方式） */
export async function getPublicSettings(): Promise<SitePublicSettings> {
  return request<SitePublicSettings>('/api/settings/public');
}

export interface LoginResult {
  user: SafeUser;
  accessToken: string;
}

export async function login(username: string, password: string): Promise<LoginResult> {
  return request<LoginResult>('/api/auth/login', {
    method: 'POST',
    body: { username, password },
    skipRefresh: true,
  });
}

export async function fetchMe(): Promise<{ user: SafeUser; groupIds: number[] }> {
  return request<{ user: SafeUser; groupIds: number[] }>('/api/auth/me');
}

export async function logout(): Promise<void> {
  await request<null>('/api/auth/logout', { method: 'POST', skipRefresh: true });
}

export async function updateProfile(input: {
  display_name?: string;
  email?: string;
}): Promise<{ user: SafeUser }> {
  return request<{ user: SafeUser }>('/api/auth/profile', { method: 'PUT', body: input });
}

export async function changePassword(input: {
  old_password: string;
  new_password: string;
}): Promise<null> {
  return request<null>('/api/auth/password', { method: 'PUT', body: input, skipRefresh: true });
}

/** 获取 SSO 跳转地址 */
export async function getSsoUrl(): Promise<{ url: string }> {
  return request<{ url: string }>('/api/auth/sso/url', { skipRefresh: true });
}
