import { useCallback, useEffect, useState } from 'react';
import { Plus, Table2 } from 'lucide-react';
import { useT } from '../../i18n';
import { Button, Input, Modal, Select } from '../ui';
import { toast } from '../../stores/toast';
import { createDataTable, listDataTables } from '../../api/datatables';
import type { DataTableColumn, DataTableView } from '../../types/api';
import { DataTableBlock } from './DataTableBlock';

const COLUMN_TYPES: DataTableColumn['type'][] = ['text', 'number', 'date', 'select', 'user'];

const TYPE_LABEL_KEYS: Record<DataTableColumn['type'], 'table.typeText' | 'table.typeNumber' | 'table.typeDate' | 'table.typeSelect' | 'table.typeUser'> = {
  text: 'table.typeText',
  number: 'table.typeNumber',
  date: 'table.typeDate',
  select: 'table.typeSelect',
  user: 'table.typeUser',
};

interface DataTablesSectionProps {
  docId: number;
  canWrite: boolean;
}

/** 文档页的多维表格区块：表格列表 + 新建向导，创建后即嵌入文档 */
export function DataTablesSection({ docId, canWrite }: DataTablesSectionProps) {
  const { t } = useT();
  const [tables, setTables] = useState<DataTableView[] | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);

  const load = useCallback(() => {
    setTables(null);
    listDataTables(docId)
      .then((res) => setTables(res.items))
      .catch(() => setTables([]));
  }, [docId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <section className="mt-10 border-t border-line pt-6" aria-label={t('table.tables')}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-fg-muted">
          <Table2 size={14} aria-hidden />
          {t('table.tables')}
        </h2>
        {canWrite && (
          <Button variant="secondary" size="sm" onClick={() => setWizardOpen(true)}>
            <Plus size={13} aria-hidden />
            {t('table.newTable')}
          </Button>
        )}
      </div>

      {tables === null ? null : tables.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line px-4 py-8 text-center">
          <p className="text-xs font-medium text-fg-secondary">{t('table.tablesEmpty')}</p>
          <p className="mt-1 text-2xs text-fg-muted">{t('table.tablesEmptyHint')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {tables.map((table) => (
            <DataTableBlock key={table.id} table={table} canWrite={canWrite} onChanged={load} />
          ))}
        </div>
      )}

      <NewTableWizard
        open={wizardOpen}
        docId={docId}
        onClose={() => setWizardOpen(false)}
        onCreated={() => {
          setWizardOpen(false);
          load();
        }}
      />
    </section>
  );
}

/** 新建表格向导：名称 + 列定义（默认两列文本，可增删） */
function NewTableWizard({
  open,
  docId,
  onClose,
  onCreated,
}: {
  open: boolean;
  docId: number;
  onClose(): void;
  onCreated(): void;
}) {
  const { t } = useT();
  const [name, setName] = useState('');
  const [columns, setColumns] = useState<DataTableColumn[]>([
    { key: 'c1', title: '名称', type: 'text' },
    { key: 'c2', title: '备注', type: 'text' },
  ]);
  const [creating, setCreating] = useState(false);

  const submit = (): void => {
    if (creating) return;
    setCreating(true);
    void createDataTable({
      document_id: docId,
      name: name.trim() || undefined,
      columns: columns.filter((c) => c.title.trim()),
    })
      .then(onCreated)
      .catch((err) => toast.error(err instanceof Error ? err.message : t('toast.networkError')))
      .finally(() => {
        setCreating(false);
        setName('');
      });
  };

  const updateColumn = (index: number, patch: Partial<DataTableColumn>): void => {
    setColumns((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  };

  return (
    <Modal open={open} onClose={onClose} title={t('table.newTable')}>
      <div className="space-y-4">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('table.tableName')} autoFocus />
        <div className="space-y-1.5">
          <p className="text-2xs font-medium text-fg-secondary">{t('table.columnName')} / {t('table.columnType')}</p>
          {columns.map((col, i) => (
            <div key={col.key} className="flex items-center gap-1.5">
              <Input
                value={col.title}
                onChange={(e) => updateColumn(i, { title: e.target.value })}
                placeholder={t('table.columnName')}
                className="flex-1"
              />
              <Select
                value={col.type}
                onChange={(e) => updateColumn(i, { type: e.target.value as DataTableColumn['type'], options: e.target.value === 'select' ? [] : undefined })}
                options={COLUMN_TYPES.map((tp) => ({ value: tp, label: t(TYPE_LABEL_KEYS[tp]) }))}
                className="w-28 shrink-0"
                aria-label={t('table.columnType')}
              />
              <button
                type="button"
                aria-label={t('table.colDelete')}
                onClick={() => setColumns((prev) => prev.filter((_, idx) => idx !== i))}
                className="shrink-0 rounded p-1.5 text-fg-muted transition-colors duration-150 hover:text-danger"
              >
                ×
              </button>
            </div>
          ))}
          <Button variant="ghost" size="sm" onClick={() => setColumns((prev) => [...prev, { key: `c${Date.now().toString(36)}`, title: '', type: 'text' }])}>
            <Plus size={12} aria-hidden />
            {t('table.addColumn')}
          </Button>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} disabled={creating || !columns.some((c) => c.title.trim())}>
            {t('table.createAndEmbed')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
