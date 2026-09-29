import { request } from './client';
import type { SearchOutcome, SearchSuggest } from '../types/api';

export interface SearchParams {
  q: string;
  space_id?: number;
  scope?: 'all' | 'title' | 'body' | 'code';
  page?: number;
  limit?: number;
  signal?: AbortSignal;
}

export async function searchDocuments(params: SearchParams): Promise<SearchOutcome> {
  const qs = new URLSearchParams();
  qs.set('q', params.q);
  if (params.space_id !== undefined) qs.set('space_id', String(params.space_id));
  if (params.scope && params.scope !== 'all') qs.set('scope', params.scope);
  qs.set('page', String(params.page ?? 1));
  qs.set('limit', String(params.limit ?? 20));
  return request<SearchOutcome>(`/api/search?${qs.toString()}`, { signal: params.signal });
}

export async function suggestTitles(q: string, signal?: AbortSignal): Promise<{ items: SearchSuggest[] }> {
  return request<{ items: SearchSuggest[] }>(
    `/api/search/suggest?q=${encodeURIComponent(q)}`,
    { signal }
  );
}
