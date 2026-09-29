import { request } from './client';
import type { Drawing } from '../types/api';

/** SVG 画板：服务端只存 SVG 源码字符串，渲染与交互全部在前端 */

export async function listDrawings(documentId: number): Promise<{ items: Drawing[] }> {
  return request<{ items: Drawing[] }>(`/api/drawings?document_id=${documentId}`);
}

export async function getDrawing(id: number): Promise<{ drawing: Drawing }> {
  return request<{ drawing: Drawing }>(`/api/drawings/${id}`);
}

export async function createDrawing(input: {
  document_id: number | null;
  title?: string;
  svg?: string;
  width?: number;
  height?: number;
}): Promise<{ drawing: Drawing }> {
  return request<{ drawing: Drawing }>('/api/drawings', { method: 'POST', body: input });
}

export async function updateDrawing(
  id: number,
  input: { title?: string; svg?: string; width?: number; height?: number }
): Promise<{ drawing: Drawing }> {
  return request<{ drawing: Drawing }>(`/api/drawings/${id}`, { method: 'PUT', body: input });
}

export async function deleteDrawing(id: number): Promise<null> {
  return request<null>(`/api/drawings/${id}`, { method: 'DELETE' });
}
