import { request } from './client';
import type { DataTableColumn, DataTableRow, DataTableView } from '../types/api';

/** 多维表格：列结构与行数据均为 JSON 存取，类型语义由前端渲染层负责 */

export async function listDataTables(documentId: number): Promise<{ items: DataTableView[] }> {
  return request<{ items: DataTableView[] }>(`/api/datatables?document_id=${documentId}`);
}

export async function getDataTable(id: number): Promise<{ table: DataTableView }> {
  return request<{ table: DataTableView }>(`/api/datatables/${id}`);
}

export async function createDataTable(input: {
  document_id: number | null;
  name?: string;
  columns?: DataTableColumn[];
}): Promise<{ table: DataTableView }> {
  return request<{ table: DataTableView }>('/api/datatables', { method: 'POST', body: input });
}

export async function updateDataTable(
  id: number,
  input: { name?: string; columns?: DataTableColumn[] }
): Promise<{ table: DataTableView }> {
  return request<{ table: DataTableView }>(`/api/datatables/${id}`, { method: 'PUT', body: input });
}

export async function deleteDataTable(id: number): Promise<null> {
  return request<null>(`/api/datatables/${id}`, { method: 'DELETE' });
}

export async function listRows(tableId: number): Promise<{ items: DataTableRow[] }> {
  return request<{ items: DataTableRow[] }>(`/api/datatables/${tableId}/rows`);
}

export async function addRow(
  tableId: number,
  cells: Record<string, unknown> = {},
  afterId?: number
): Promise<{ row: DataTableRow }> {
  return request<{ row: DataTableRow }>(`/api/datatables/${tableId}/rows`, {
    method: 'POST',
    body: { cells, after_id: afterId },
  });
}

export async function updateRow(
  tableId: number,
  rowId: number,
  cells: Record<string, unknown>
): Promise<{ row: DataTableRow }> {
  return request<{ row: DataTableRow }>(`/api/datatables/${tableId}/rows/${rowId}`, {
    method: 'PUT',
    body: { cells },
  });
}

export async function deleteRow(tableId: number, rowId: number): Promise<null> {
  return request<null>(`/api/datatables/${tableId}/rows/${rowId}`, { method: 'DELETE' });
}
