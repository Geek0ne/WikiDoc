import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, FileUp, UploadCloud, XCircle } from 'lucide-react';
import { useT } from '../i18n';
import { toast } from '../stores/toast';
import * as importApi from '../api/import';
import * as spacesApi from '../api/spaces';
import type { ImportJob, Space } from '../types/api';
import { Button, Empty, Select, Spinner } from '../components/ui';

const ACCEPT = '.md,.markdown,.docx,.xlsx';

/** 导入页：拖拽/点选上传 + 目标空间/父文档 + 任务列表轮询 */
export default function ImportPage() {
  const { t } = useT();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [spaces, setSpaces] = useState<Space[]>([]);
  const [spaceId, setSpaceId] = useState('');
  const [parentId, setParentId] = useState('');
  const [asDraft, setAsDraft] = useState(false);
  const [selected, setSelected] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [jobs, setJobs] = useState<ImportJob[] | null>(null);

  useEffect(() => {
    void spacesApi
      .listSpaces()
      .then((res) => setSpaces(res.items))
      .catch(() => setSpaces([]));
  }, []);

  const loadJobs = useCallback(async (): Promise<void> => {
    try {
      const res = await importApi.listImportJobs();
      setJobs(res.items);
    } catch {
      setJobs([]);
    }
  }, []);

  useEffect(() => void loadJobs(), [loadJobs]);

  // 存在处理中的任务时 2s 轮询
  const hasPending = jobs?.some((j) => j.status === 'pending' || j.status === 'running') ?? false;
  useEffect(() => {
    if (!hasPending) return;
    const timer = window.setInterval(() => void loadJobs(), 2000);
    return () => window.clearInterval(timer);
  }, [hasPending, loadJobs]);

  const acceptFile = (file: File | null): void => {
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (!lower.endsWith('.md') && !lower.endsWith('.markdown') && !lower.endsWith('.docx') && !lower.endsWith('.xlsx')) {
      toast.warning(t('import.unsupported', { ext: `.${lower.split('.').pop() ?? '?'}` }));
      return;
    }
    setSelected(file);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    setDragOver(false);
    acceptFile(e.dataTransfer.files?.[0] ?? null);
  };

  const submit = async (): Promise<void> => {
    if (!selected) {
      toast.warning(t('import.chooseFileFirst'));
      return;
    }
    if (!spaceId) {
      toast.warning(t('import.chooseSpaceFirst'));
      return;
    }
    setSubmitting(true);
    try {
      await importApi.submitImport({
        file: selected,
        target_space_id: Number(spaceId),
        parent_id: parentId ? Number(parentId) : null,
        status: asDraft ? 'draft' : 'published',
      });
      toast.success(t('import.submit'));
      setSelected(null);
      await loadJobs();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('toast.networkError'));
    } finally {
      setSubmitting(false);
    }
  };

  const spaceById = new Map(spaces.map((sp) => [sp.id, sp]));

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-8 md:px-8">
        <header className="mb-5">
          <h1 className="text-xl font-semibold tracking-tight">{t('import.title')}</h1>
          <p className="mt-1 text-2xs text-fg-muted">{t('import.dropzoneHint')}</p>
        </header>

        {/* 拖拽上传区 */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && fileRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors duration-150 ${
            dragOver ? 'border-primary bg-primary-soft' : 'border-line bg-elevated hover:border-primary-soft-border'
          }`}
        >
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              acceptFile(e.target.files?.[0] ?? null);
              e.target.value = '';
            }}
          />
          <UploadCloud size={28} aria-hidden className={dragOver ? 'text-primary' : 'text-fg-muted'} />
          {selected ? (
            <p className="text-sm font-medium">{selected.name}</p>
          ) : (
            <p className="text-sm text-fg-secondary">{t('import.dropzone')}</p>
          )}
          <p className="text-2xs text-fg-muted">{t('import.dropzoneHint')}</p>
        </div>

        {/* 目标设置 */}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Select
            label={t('import.targetSpace')}
            value={spaceId}
            onChange={(e) => setSpaceId(e.target.value)}
            options={[
              { value: '', label: t('import.chooseSpaceFirst'), disabled: true },
              ...spaces.map((sp) => ({ value: String(sp.id), label: sp.name })),
            ]}
          />
          <Select
            label={t('import.parentDoc')}
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            options={[{ value: '', label: t('import.pickTarget') }]}
          />
        </div>
        <label className="mt-3 flex w-fit items-center gap-2 text-sm text-fg-secondary">
          <input
            type="checkbox"
            checked={asDraft}
            onChange={(e) => setAsDraft(e.target.checked)}
            className="h-3.5 w-3.5 accent-[var(--primary)]"
          />
          {t('import.asDraft')}
        </label>
        <div className="mt-4">
          <Button variant="primary" loading={submitting} onClick={() => void submit()}>
            <FileUp size={15} aria-hidden />
            {submitting ? t('import.submitting') : t('import.submit')}
          </Button>
        </div>

        {/* 任务列表 */}
        <section aria-label={t('import.jobs')} className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-fg-secondary">{t('import.jobs')}</h2>
          {jobs === null ? (
            <div className="flex justify-center py-8">
              <Spinner size={20} />
            </div>
          ) : jobs.length === 0 ? (
            <Empty title={t('import.noJobs')} />
          ) : (
            <ul className="overflow-hidden rounded-lg border border-line bg-elevated">
              {jobs.map((job, i) => (
                <li
                  key={job.id}
                  className={`flex flex-wrap items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t border-line' : ''}`}
                >
                  <JobStatusIcon status={job.status} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{job.filename}</p>
                    <p className="mt-0.5 font-mono text-2xs text-fg-muted">
                      {job.job_no}
                      {job.error ? ` · ${job.error}` : ''}
                    </p>
                  </div>
                  <JobStatusBadge status={job.status} />
                  {job.status === 'success' && <JumpButton job={job} spaceById={spaceById} onGo={(to) => navigate(to)} />}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function JobStatusIcon({ status }: { status: ImportJob['status'] }) {
  if (status === 'success') return <CheckCircle2 size={16} aria-hidden className="shrink-0 text-success" />;
  if (status === 'failed') return <XCircle size={16} aria-hidden className="shrink-0 text-danger" />;
  return <Spinner size={14} className="shrink-0" />;
}

function JobStatusBadge({ status }: { status: ImportJob['status'] }) {
  const { t } = useT();
  const map: Record<ImportJob['status'], { label: string; cls: string }> = {
    pending: { label: t('import.statusPending'), cls: 'text-fg-muted' },
    running: { label: t('import.statusRunning'), cls: 'text-primary' },
    success: { label: t('import.statusSuccess'), cls: 'text-success' },
    failed: { label: t('import.statusFailed'), cls: 'text-danger' },
  };
  const item = map[status];
  return <span className={`shrink-0 text-2xs font-medium ${item.cls}`}>{item.label}</span>;
}

/** 成功任务跳转结果文档：result 字段存 JSON（doc_ids），解析第一个 */
function JumpButton({
  job,
  spaceById,
  onGo,
}: {
  job: ImportJob;
  spaceById: Map<number, Space>;
  onGo: (to: string) => void;
}) {
  const { t } = useT();
  const docId = parseResultDocId(job.result);
  if (!docId) return null;
  const space = spaceById.get(job.target_space_id ?? 0);
  return (
    <Button size="sm" variant="ghost" onClick={() => onGo(`/s/${space?.key ?? ''}/d/${docId}`)}>
      {t('import.viewDoc')}
    </Button>
  );
}

function parseResultDocId(result: string | null): number | null {
  if (!result) return null;
  try {
    const parsed: unknown = JSON.parse(result);
    if (Array.isArray(parsed) && typeof parsed[0] === 'number') return parsed[0];
    if (parsed && typeof parsed === 'object' && 'doc_ids' in parsed) {
      const ids = (parsed as { doc_ids: unknown }).doc_ids;
      if (Array.isArray(ids) && typeof ids[0] === 'number') return ids[0];
    }
    return null;
  } catch {
    return null;
  }
}
