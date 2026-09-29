import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Dict } from './zh-CN';
import { zhCN } from './zh-CN';
import { en } from './en';
import { readPrefs, writePrefs } from '../stores/prefs';

export type Locale = 'zh-CN' | 'en';

/** 点路径类型：t('common.save') 合法，拼错键名直接编译报错 */
type PathOf<T> = T extends Record<string, unknown>
  ? {
      [K in keyof T & string]: T[K] extends Record<string, unknown> ? `${K}.${PathOf<T[K]>}` : K;
    }[keyof T & string]
  : never;

export type TKey = PathOf<Dict>;

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TKey, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

const DICTS: Record<Locale, Dict> = { 'zh-CN': zhCN, en };

function lookup(dict: Dict, key: string): string | undefined {
  let node: unknown = dict;
  for (const seg of key.split('.')) {
    if (node && typeof node === 'object' && seg in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[seg];
    } else {
      return undefined;
    }
  }
  return typeof node === 'string' ? node : undefined;
}

function translate(locale: Locale, key: TKey, params?: Record<string, string | number>): string {
  const raw = lookup(DICTS[locale], key) ?? lookup(DICTS['zh-CN'], key) ?? key;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, name: string) =>
    params[name] !== undefined ? String(params[name]) : `{${name}}`
  );
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const saved = readPrefs().locale;
    if (saved === 'zh-CN' || saved === 'en') return saved;
    return navigator.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';
  });

  const setLocale = useCallback((next: Locale) => {
    writePrefs({ locale: next });
    setLocaleState(next);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const t = useCallback(
    (key: TKey, params?: Record<string, string | number>) => translate(locale, key, params),
    [locale]
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** 界面文案入口：const { t } = useT(); */
export function useT(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useT 必须在 I18nProvider 内使用');
  return ctx;
}
