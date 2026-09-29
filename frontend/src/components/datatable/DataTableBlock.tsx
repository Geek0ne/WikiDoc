import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { useT } from '../../i18n';
import { Button, ConfirmDialog, Select } from '../ui';
import { toast } from '../../stores/toast';
import {
  addRow,
  deleteDataTable,
  deleteRow,
  listRows,
  updateDataTable,
  updateRow,
} from '../../api/datatables';
import type { DataTableColumn, DataTableRow, DataTableView } from '../../types/api';

const COLUMN_TYPES: DataTableColumn['type'][] = ['text', 'number', 'date', 'select', 'user'];

const TYPE_LABEL_KEYS: Record<DataTableColumn['type'], 'table.typeText' | 'table.typeNumber' | 'table.typeDate' | 'table.typeSelect' | 'table.typeUser'> = {
  text: 'table.typeText',
  number: 'table.typeNumber',
  date: 'table.typeDate',
  select: 'table.typeSelect',
  user: 'table.typeUser',
};

interface DataTableBlockProps {
  table: DataTableView;
  canWrite: boolean;
  onChanged(): void;
}

/** 单个多维表格：列结构编辑 + 行内联编辑，保存即时生效 */
export function DataTableBlock({ table, canWrite, onChanged }: DataTableBlockProps) {
  const { t } = useT();
  const [open, setOpen] = useState(true);
  const [rows, setRows] = useState<DataTableRow[] | null>(null);
  const [columns, setColumns] = useState<DataTableColumn[]>(table.columns);
  const [addingColumn, setAddingColumn] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const loadRows = useCallback(() => {
    setRows(null);
    listRows(table.id)
      .then((res) => setRows(res.items))
      .catch(() => setRows([]));
  }, [table.id]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  /* ---------- 列操作（PUT /datatables/:id） ---------- */
  const persistColumns = (next: DataTableColumn[]): void => {
    setColumns(next);
    void updateDataTable(table.id, { columns: next })
      .then(() => onChanged())
      .catch((err) => toast.error(err instanceof Error ? err.message : t('toast.networkError')));
  };

  const renameColumn = (key: string, title: string): void => {
    if (!title.trim()) return;
    persistColumns(columns.map((c) => (c.key === key ? { ...c, title: title.trim() } : c)));
  };

  const changeColumnType = (key: string, type: DataTableColumn['type']): void => {
    persistColumns(columns.map((c) => (c.key === key ? { ...c, type, options: type === 'select' ? c.options ?? [] : undefined } : c)));
  };

  const removeColumn = (key: string): void => {
    persistColumns(columns.filter((c) => c.key !== key));
  };

  const appendColumn = (title: string, type: DataTableColumn['type'], options: string[]): void => {
    if (!title.trim()) return;
    const key = `c${Date.now().toString(36)}`;
    persistColumns([...columns, { key, title: title.trim(), type, options: options.length ? options : undefined }]);
    setAddingColumn(false);
  };

  /* ---------- 行操作 ---------- */
  const setCell = (rowId: number, key: string, value: unknown): void => {
    setRows((prev) => (prev ?? []).map((r) => (r.id === rowId ? { ...r, cells: { ...r.cells, [key]: value } } : r)));
    const row = rows?.find((r) => r.id === rowId);
    void updateRow(table.id, rowId, { ...(row?.cells ?? {}), [key]: value }).catch((err) =>
      toast.error(err instanceof Error ? err.message : t('toast.networkError'))
    );
  };

  const appendRow = (): void => {
    void addRow(table.id, {})
      .then(() => loadRows())
      .catch((err) => toast.error(err instanceof Error ? err.message : t('toast.networkError')));
  };

  const removeRow = (rowId: number): void => {
    void deleteRow(table.id, rowId)
      .then(() => setRows((prev) => (prev ?? []).filter((r) => r.id !== rowId)))
      .catch((err) => toast.error(err instanceof Error ? err.message : t('toast.networkError')));
  };

  const removeTable = (): void => {
    void deleteDataTable(table.id)
      .then(() => {
        toast.success(t('toast.deleted'));
        onChanged();
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : t('toast.networkError')));
  };

  /* ---------- 单元格控件 ---------- */
  const renderCell = (row: DataTableRow, col: DataTableColumn) => {
    const value = row.cells[col.key];
    const base =
      'w-full min-w-0 rounded bg-transparent px-1.5 py-1 text-xs text-fg outline-none transition-colors duration-150 focus:bg-bg focus:shadow-[var(--focus-ring)]';
    if (!canWrite) return <span className="block truncate px-1.5 py-1 text-xs text-fg-secondary">{String(value ?? '')}</span>;
    if (col.type === 'number') {
      return (
        <input
          type="number"
          defaultValue={value === undefined || value === null ? '' : String(value)}
          className={base}
          onBlur={(e) => e.target.value !== String(value ?? '') && setCell(row.id, col.key, e.target.value === '' ? null : Number(e.target.value))}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      );
    }
    if (col.type === 'date') {
      return (
        <input
          type="date"
          defaultValue={value ? String(value).slice(0, 10) : ''}
          className={base}
          onChange={(e) => setCell(row.id, col.key, e.target.value || null)}
        />
      );
    }
    if (col.type === 'select' && col.options?.length) {
      return (
        <select
          value={value === undefined || value === null ? '' : String(value)}
          onChange={(e) => setCell(row.id, col.key, e.target.value || null)}
          className={`${base} cursor-pointer`}
        >
          <option value="">{t('table.selectPlaceholder')}</option>
          {col.options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    }
    return (
      <input
        type="text"
        defaultValue={value === undefined || value === null ? '' : String(value)}
        className={base}
        onBlur={(e) => e.target.value !== String(value ?? '') && setCell(row.id, col.key, e.target.value || null)}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
    );
  };

  return (
    <section className="overflow-hidden rounded-lg border border-line bg-bg" aria-label={table.name}>
      {/* 表头：名称 + 折叠 + 删除 */}
      <div className="flex items-center gap-1 border-b border-line bg-bg-elevated px-3 py-2">
        <button type="button" onClick={() => setOpen((v) => !v)} className="flex min-w-0 flex-1 items-center gap-1 text-left" aria-expanded={open}>
          {open ? <ChevronDown size={14} aria-hidden className="shrink-0 text-fg-muted" /> : <ChevronRight size={14} aria-hidden className="shrink-0 text-fg-muted" />}
          <span className="truncate text-xs font-semibold text-fg">{table.name}</span>
        </button>
        {canWrite && (
          <>
            <Button variant="ghost" size="sm" onClick={() => setAddingColumn(true)}>
              <Plus size={12} aria-hidden />
              {t('table.addColumn')}
            </Button>
            <Button variant="ghost" size="sm" onClick={appendRow}>
              <Plus size={12} aria-hidden />
              {t('table.addRow')}
            </Button>
            <Button variant="ghost" size="sm" aria-label={t('common.delete')} onClick={() => setDeleteConfirm(true)}>
              <Trash2 size={12} aria-hidden className="text-fg-muted" />
            </Button>
          </>
        )}
      </div>

      {open && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse text-left">
            <thead>
              <tr className="border-b border-line bg-bg-sunken">
                {columns.map((col) => (
                  <th key={col.key} className="min-w-[110px] px-2 py-1.5 align-middle font-medium">
                    <div className="flex items-center gap-1">
                      {canWrite ? (
                        <input
                          defaultValue={col.title}
                          className="w-full min-w-0 rounded bg-transparent px-1 py-0.5 text-2xs font-semibold text-fg-secondary outline-none focus:bg-bg focus:shadow-[var(--focus-ring)]"
                          onBlur={(e) => e.target.value.trim() !== col.title && renameColumn(col.key, e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                          aria-label={t('table.columnName')}
                        />
                      ) : (
                        <span className="text-2xs font-semibold text-fg-secondary">{col.title}</span>
                      )}
                      {canWrite && (
                        <button
                          type="button"
                          aria-label={t('table.colDelete')}
                          className="shrink-0 rounded p-0.5 text-fg-muted opacity-0 transition-opacity duration-150 hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
                          onClick={() => removeColumn(col.key)}
                        >
                          <Trash2 size={11} aria-hidden />
                        </button>
                      )}
                    </div>
                    {canWrite ? (
                      <Select
                        value={col.type}
                        options={COLUMN_TYPES.map((tp) => ({ value: tp, label: t(TYPE_LABEL_KEYS[tp]) }))}
                        onChange={(e) => changeColumnType(col.key, e.target.value as DataTableColumn['type'])}
                        className="mt-0.5 !border-none !bg-transparent !py-0 !text-2xs !text-fg-muted"
                        aria-label={t('table.columnType')}
                      />
                    ) : (
                      <span className="mt-0.5 block px-1 text-2xs text-fg-muted">{t(TYPE_LABEL_KEYS[col.type])}</span>
                    )}
                  </th>
                ))}
                <th className="w-8 px-2" aria-label="actions" />
              </tr>
            </thead>
            <tbody>
              {rows === null ? (
                <tr>
                  <td colSpan={columns.length + 1} className="px-3 py-4 text-center">
                    <span className="text-2xs text-fg-muted">…</span>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + 1} className="px-3 py-4 text-center text-2xs text-fg-muted">
                    {t('table.emptyHint')}
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="group border-b border-line last:border-b-0 hover:bg-bg-elevated">
                    {columns.map((col) => (
                      <td key={col.key} className="border-l border-line px-1 py-0.5 first:border-l-0">
                        {renderCell(row, col)}
                      </td>
                    ))}
                    <td className="px-1 text-center">
                      {canWrite && (
                        <button
                          type="button"
                          aria-label={t('table.rowDelete')}
                          className="rounded p-1 text-fg-muted opacity-0 transition-opacity duration-150 hover:text-danger group-hover:opacity-100"
                          onClick={() => removeRow(row.id)}
                        >
                          <Trash2 size={11} aria-hidden />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {addingColumn && <NewColumnDialog onCancel={() => setAddingColumn(false)} onConfirm={appendColumn} />}

      <ConfirmDialog
        open={deleteConfirm}
        title={t('common.delete')}
        message={t('table.deleteConfirm', { name: table.name })}
        onConfirm={() => void removeTable()}
        onCancel={() => setDeleteConfirm(false)}
      />
    </section>
  );
}

/** 加列向导：名称 + 类型（单选类型附选项输入） */
function NewColumnDialog({
  onCancel,
  onConfirm,
}: {
  onCancel(): void;
  onConfirm(title: string, type: DataTableColumn['type'], options: string[]): void;
}) {
  const { t } = useT();
  const [title, setTitle] = useState('');
  const [type, setType] = useState<DataTableColumn['type']>('text');
  const [options, setOptions] = useState('');

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={t('table.addColumn')}>
      <div className="w-full max-w-sm space-y-3 rounded-lg border border-line bg-bg p-4 shadow-[var(--shadow-overlay)]">
        <h3 className="text-sm font-semibold">{t('table.addColumn')}</h3>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('table.columnName')}
          className="w-full rounded border border-line bg-bg-elevated px-2.5 py-1.5 text-xs text-fg outline-none focus:shadow-[var(--focus-ring)]"
        />
        <Select
          value={type}
          onChange={(e) => setType(e.target.value as DataTableColumn['type'])}
          options={COLUMN_TYPES.map((tp) => ({ value: tp, label: t(TYPE_LABEL_KEYS[tp]) }))}
          aria-label={t('table.columnType')}
        />
        {type === 'select' && (
          <input
            value={options}
            onChange={(e) => setOptions(e.target.value)}
            placeholder={t('table.optionsHint')}
            className="w-full rounded border border-line bg-bg-elevated px-2.5 py-1.5 text-xs text-fg outline-none focus:shadow-[var(--focus-ring)]"
          />
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button size="sm" onClick={() => onConfirm(title, type, options.split(/[,，]/).map((s) => s.trim()).filter(Boolean))}>
            {t('common.confirm')}
          </Button>
        </div>
      </div>
    </div>
  );
}
