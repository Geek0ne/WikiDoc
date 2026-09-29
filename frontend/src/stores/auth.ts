import { create } from 'zustand';
import * as authApi from '../api/auth';
import { clearToken, getToken, setToken, setUnauthorizedHandler } from '../api/client';
import type { LoginProviders, SafeUser } from '../types/api';

export type AuthStatus = 'loading' | 'authed' | 'guest';

interface AuthState {
  status: AuthStatus;
  user: SafeUser | null;
  providers: LoginProviders | null;
  /** 启动探测：无 token 时也静默试一次（refresh cookie 可能仍有效，SSO 回跳场景） */
  init: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProviders: () => Promise<void>;
  setUser: (user: SafeUser) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'loading',
  user: null,
  providers: null,

  init: async () => {
    // 登录方式清单无需鉴权，登录页也要用
    void get()
      .refreshProviders()
      .catch(() => undefined);

    if (!getToken()) {
      try {
        // client 层会在 401 时单飞刷新并写入新 token，这里直接复用
        const me = await authApi.fetchMe();
        set({ status: 'authed', user: me.user });
        return;
      } catch {
        set({ status: 'guest', user: null });
        return;
      }
    }

    try {
      const me = await authApi.fetchMe();
      set({ status: 'authed', user: me.user });
    } catch {
      set({ status: 'guest', user: null });
    }
  },

  login: async (username, password) => {
    const result = await authApi.login(username, password);
    setToken(result.accessToken);
    set({ status: 'authed', user: result.user });
  },

  logout: async () => {
    try {
      await authApi.logout();
    } catch {
      /* 后端登出失败也照常清本地态 */
    }
    clearToken();
    set({ status: 'guest', user: null });
  },

  refreshProviders: async () => {
    const providers = await authApi.getProviders();
    set({ providers });
  },

  setUser: (user) => set({ user }),
}));

/** 会话失效（刷新失败）时统一清态；路由守卫据此跳登录页 */
export function bindUnauthorizedHandler(navigateToLogin: () => void): void {
  setUnauthorizedHandler(() => {
    if (useAuthStore.getState().status !== 'guest') {
      useAuthStore.setState({ status: 'guest', user: null });
      navigateToLogin();
    }
  });
}
