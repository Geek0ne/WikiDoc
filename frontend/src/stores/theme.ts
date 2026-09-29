import { create } from 'zustand';
import type { ThemeMode, AccentName } from '../types/api';
import { readPrefs, writePrefs } from './prefs';

interface ThemeState {
  theme: ThemeMode;
  accent: AccentName;
  systemDark: boolean;
  setTheme: (theme: ThemeMode) => void;
  /** 在 light → dark → system 之间循环切换 */
  cycleTheme: () => void;
  setAccent: (accent: AccentName) => void;
  /** 把当前解析结果写到 documentElement 属性上 */
  apply: () => void;
}

function resolveDark(theme: ThemeMode, systemDark: boolean): boolean {
  return theme === 'dark' || (theme === 'system' && systemDark);
}

function applyTheme(theme: ThemeMode, accent: AccentName, systemDark: boolean): void {
  const root = document.documentElement;
  root.dataset.theme = resolveDark(theme, systemDark) ? 'dark' : 'light';
  root.dataset.accent = accent;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: readPrefs().theme ?? 'system',
  accent: readPrefs().accent ?? 'default',
  systemDark: window.matchMedia('(prefers-color-scheme: dark)').matches,

  setTheme: (theme) => {
    writePrefs({ theme });
    set({ theme });
    get().apply();
  },

  cycleTheme: () => {
    const order: ThemeMode[] = ['light', 'dark', 'system'];
    const next = order[(order.indexOf(get().theme) + 1) % order.length] ?? 'light';
    get().setTheme(next);
  },

  setAccent: (accent) => {
    writePrefs({ accent });
    set({ accent });
    get().apply();
  },

  apply: () => {
    const { theme, accent, systemDark } = get();
    applyTheme(theme, accent, systemDark);
  },
}));

/** 应用启动时调用：立即应用一次，并跟随系统明暗变化 */
export function initTheme(): () => void {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const onChange = (e: MediaQueryListEvent): void => {
    useThemeStore.setState({ systemDark: e.matches });
    useThemeStore.getState().apply();
  };
  useThemeStore.getState().apply();
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}
