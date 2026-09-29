import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { FileText, Search, SlidersHorizontal } from 'lucide-react';
import { useT } from '../i18n';
import * as searchApi from '../api/search';
import * as spacesApi from '../api/spaces';
import { useDebouncedValue } from '../hooks/useDebounce';
import type { SearchHit, SearchOutcome, SearchSuggest, Space } from '../types/api';
import { Empty, Select, Spinner } from '../components/ui';

type Scope = 'all' | 'title' | 'body' | 'code';

/** 全站搜索页：防抖即时搜索 + 空间过滤 + 范围切换 + 标题建议 */
export default function SearchPage() {
  const { t } = useT();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [keyword, setKeyword] = useState(params.get('q') ?? '');
  const debounced = useDebouncedValue(keyword, 300);
  const [spaceId, setSpaceId] = useState(params.get('space_id') ?? '');
  const [scope, setScope] = useState<Scope>('all');

  const [spaces, setSpaces] = useState<Space[]>([]);
  const [result, setResult] = useState<SearchOutcome | null>(null);
  const [suggests, setSuggests] = useState<SearchSuggest[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void spacesApi
      .listSpaces()
      .then((res) => setSpaces(res.items))
      .catch(() => setSpaces([]));
  }, []);

  // 查询条件同步 URL，刷新/回退可用
  useEffect(() => {
    const qs = new URLSearchParams();
    if (debounced.trim()) qs.set('q', debounced.trim());
    if (spaceId) qs.set('space_id', spaceId);
    navigate(`/search?${qs.toString()}`, { replace: true });
  }, [debounced, spaceId, navigate]);

  // 即时搜索（AbortController 防竞态）
  useEffect(() => {
    const q = debounced.trim();
    if (!q) {
      setResult(null);
      setSuggests([]);
      setError(null);
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    setError(null);
    void (async () => {
      try {
        const res = await searchApi.searchDocuments({
          q,
          space_id: spaceId ? Number(spaceId) : undefined,
          scope,
          signal: controller.signal,
        });
        setResult(res);
        setSuggests([]);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : t('toast.networkError'));
        setResult(null);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    })();
    return () => controller.abort();
  }, [debounced, spaceId, scope, t]);

  // 结果偏少时补充标题建议
  useEffect(() => {
    const q = debounced.trim();
    if (!q || (result !== null && result.items.length >= 3)) {
      setSuggests([]);
      return;
    }
    const controller = new AbortController();
    void searchApi
      .suggestTitles(q, controller.signal)
      .then((res) => setSuggests(res.items))
      .catch(() => undefined);
    return () => controller.abort();
  }, [debounced, result]);

  const spaceKeyById = useMemo(() => {
    const map = new Map<number, string>();
    spaces.forEach((sp) => map.set(sp.id, sp.key));
    return map;
  }, [spaces]);

  const total = result?.total ?? 0;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-8 md:px-8">
        {/* 大搜索框 */}
        <div className="relative">
          <Search
            size={17}
            aria-hidden
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-fg-muted"
          />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder={t('search.placeholder')}
            aria-label={t('common.search')}
            autoFocus
            className="h-12 w-full rounded-lg border border-line bg-elevated pl-11 pr-10 text-base shadow-sm transition-[border-color,box-shadow] duration-150 focus:border-primary focus:shadow-[var(--focus-ring)] focus:outline-none"
          />
          {searching && (
            <span className="absolute right-4 top-1/2 -translate-y-1/2">
              <Spinner size={16} />
            </span>
          )}
        </div>

        {/* 过滤器行 */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <SlidersHorizontal size={13} aria-hidden className="text-fg-muted" />
          <div className="flex overflow-hidden rounded border border-line">
            {(['all', 'title', 'body', 'code'] as Scope[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setScope(s)}
                aria-pressed={scope === s}
                className={`px-3 py-1.5 text-2xs transition-colors duration-150 ${
                  scope === s ? 'bg-primary text-primary-fg' : 'bg-elevated text-fg-secondary hover:bg-hover'
                }`}
              >
                {s === 'all'
                  ? t('search.scopeAll')
                  : s === 'title'
                    ? t('search.scopeTitle')
                    : s === 'body'
                      ? t('search.scopeBody')
                      : t('search.scopeCode')}
              </button>
            ))}
          </div>
          <div className="w-44">
            <Select
              aria-label={t('search.allSpaces')}
              value={spaceId}
              onChange={(e) => setSpaceId(e.target.value)}
              options={[
                { value: '', label: t('search.allSpaces') },
                ...spaces.map((sp) => ({ value: String(sp.id), label: sp.name })),
              ]}
            />
          </div>
          {result?.fallback && (
            <span className="text-2xs text-fg-muted">{t('search.fallbackHint')}</span>
          )}
        </div>

        {/* 结果区 */}
        <div className="mt-6">
          {error && <p className="py-6 text-center text-sm text-danger">{error}</p>}

          {!error && !debounced.trim() && (
            <Empty icon={<Search size={22} aria-hidden />} title={t('search.inputHint')} />
          )}

          {!error && debounced.trim() && !searching && result && result.items.length === 0 && (
            <Empty
              icon={<Search size={22} aria-hidden />}
              title={t('search.noResults')}
              hint={t('search.noResultsHint')}
            />
          )}

          {/* 标题建议（结果偏少时） */}
          {suggests.length > 0 && (
            <div className="mb-4">
              <p className="mb-1.5 text-2xs font-medium text-fg-muted">{t('search.suggest')}</p>
              <div className="flex flex-wrap gap-1.5">
                {suggests.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setKeyword(s.title)}
                    className="rounded-full border border-line bg-elevated px-3 py-1 text-2xs text-fg-secondary transition-colors duration-150 hover:border-primary-soft-border hover:text-primary"
                  >
                    {s.title}
                    <span className="ml-1.5 text-fg-muted">{s.space_name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {result && result.items.length > 0 && (
            <>
              <p className="mb-3 text-2xs text-fg-muted">{t('search.total', { total })}</p>
              <ul className="space-y-2.5">
                {result.items.map((hit) => (
                  <li key={hit.id}>
                    <SearchHitCard
                      hit={hit}
                      query={debounced.trim()}
                      spaceKey={spaceKeyById.get(hit.space_id)}
                    />
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * 单条结果卡片。snippet 为后端返回的纯文本，
 * 关键词高亮通过文本节点拆分实现（不拼 HTML，无注入面）。
 */
function SearchHitCard({ hit, query, spaceKey }: { hit: SearchHit; query: string; spaceKey?: string }) {
  const to = spaceKey ? `/s/${spaceKey}/d/${hit.id}` : '';
  return (
    <Link
      to={to}
      className={`block rounded-lg border border-line bg-elevated p-4 transition-all duration-150 hover:border-primary-soft-border hover:shadow-sm ${to ? '' : 'pointer-events-none opacity-60'}`}
    >
      <div className="flex items-center gap-2">
        <FileText size={14} aria-hidden className="shrink-0 text-fg-muted" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          <Highlighted text={hit.title} query={query} />
        </span>
        <span className="shrink-0 text-2xs text-fg-muted">{hit.space_name}</span>
      </div>
      {hit.snippet && (
        <p className="mt-1.5 line-clamp-2 text-2xs leading-relaxed text-fg-secondary">
          <Highlighted text={hit.snippet} query={query} />
        </p>
      )}
    </Link>
  );
}

/** 把命中关键词包上 <mark>：基于字符串拆分，全部是 React 文本节点 */
function Highlighted({ text, query }: { text: string; query: string }): ReactNode {
  const q = query.trim();
  if (!q) return text;
  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  const parts: ReactNode[] = [];
  let cursor = 0;
  let idx = lower.indexOf(needle);
  let seq = 0;
  while (idx >= 0) {
    if (idx > cursor) parts.push(text.slice(cursor, idx));
    parts.push(<mark key={`m-${seq++}`}>{text.slice(idx, idx + needle.length)}</mark>);
    cursor = idx + needle.length;
    idx = lower.indexOf(needle, cursor);
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}
