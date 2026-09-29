/**
 * 本地偏好持久化。主题、强调色、语言共用同一个 localStorage 键，
 * 各模块读写自己的字段，避免整包覆盖造成丢失。
 */

export interface LocalPrefs {
  theme?: 'light' | 'dark' | 'system';
  accent?: 'default' | 'forest' | 'sunset';
  locale?: 'zh-CN' | 'en';
  sidebarCollapsed?: boolean;
}

const PREFS_KEY = 'wikidoc.prefs';

export function readPrefs(): LocalPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as LocalPrefs;
    return {};
  } catch {
    return {};
  }
}

export function writePrefs(patch: Partial<LocalPrefs>): void {
  try {
    const merged = { ...readPrefs(), ...patch };
    localStorage.setItem(PREFS_KEY, JSON.stringify(merged));
  } catch {
    /* 隐私模式等场景忽略 */
  }
}
