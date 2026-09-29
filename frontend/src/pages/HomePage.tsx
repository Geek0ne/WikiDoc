import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Clock3, FileText, FolderPlus, Star } from 'lucide-react';
import { useT } from '../i18n';
import * as documentsApi from '../api/documents';
import * as spacesApi from '../api/spaces';
import { ApiError } from '../api/client';
import type { Document, Space } from '../types/api';
import { NewSpaceModal } from '../components/layout/AppLayout';
import { useOutletContext } from 'react-router-dom';
import type { OutletContext } from '../components/layout/layout-context';
import { Button, Empty, Spinner } from '../components/ui';

/** 首页：最近浏览 / 我的收藏 / 空间卡片网格 */
export default function HomePage() {
  const { t } = useT();
  const navigate = useNavigate();
  const { reloadSpaces } = useOutletContext<OutletContext>();

  const [recent, setRecent] = useState<Document[] | null>(null);
  const [favorites, setFavorites] = useState<Document[] | null>(null);
  const [spaces, setSpaces] = useState<Space[] | null>(null);
  const [newSpaceOpen, setNewSpaceOpen] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const loadAll = useCallback(async (): Promise<void> => {
    setLoadError(false);
    try {
      const [r, f, s] = await Promise.all([
        documentsApi.listRecent().catch(() => ({ items: [] })),
        documentsApi.listFavorites().catch(() => ({ items: [] })),
        spacesApi.listSpaces(),
      ]);
      setRecent(r.items);
      setFavorites(f.items);
      setSpaces(s.items);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setSpaces([]);
        setRecent([]);
        setFavorites([]);
      } else {
        setLoadError(true);
      }
    }
  }, []);

  useEffect(() => void loadAll(), [loadAll]);

  const fmtTime = (iso: string | null): string => {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">{t('home.welcome')}</h1>
          <p className="mt-1 text-sm text-fg-secondary">{t('home.welcomeHint')}</p>
        </header>

        {loadError && (
          <div className="mb-6 flex items-center justify-between rounded-lg border border-line bg-elevated px-4 py-3">
            <p className="text-sm text-fg-secondary">{t('common.error')}</p>
            <Button size="sm" onClick={() => void loadAll()}>
              {t('common.retry')}
            </Button>
          </div>
        )}

        <div className="grid gap-8 lg:grid-cols-2">
          {/* 最近浏览 */}
          <section aria-labelledby="recent-title">
            <h2 id="recent-title" className="mb-3 flex items-center gap-2 text-sm font-semibold text-fg-secondary">
              <Clock3 size={15} aria-hidden />
              {t('home.recent')}
            </h2>
            {recent === null ? (
              <div className="flex justify-center py-8">
                <Spinner size={20} />
              </div>
            ) : recent.length === 0 ? (
              <CardShell>
                <Empty title={t('home.emptyRecent')} />
              </CardShell>
            ) : (
              <ul className="overflow-hidden rounded-lg border border-line bg-elevated">
                {recent.map((doc, i) => (
                  <li key={doc.id} className={i > 0 ? 'border-t border-line' : ''}>
                    <DocRow doc={doc} spaces={spaces} meta={fmtTime(doc.updated_at)} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 我的收藏 */}
          <section aria-labelledby="fav-title">
            <h2 id="fav-title" className="mb-3 flex items-center gap-2 text-sm font-semibold text-fg-secondary">
              <Star size={15} aria-hidden />
              {t('home.favorites')}
            </h2>
            {favorites === null ? (
              <div className="flex justify-center py-8">
                <Spinner size={20} />
              </div>
            ) : favorites.length === 0 ? (
              <CardShell>
                <Empty title={t('home.emptyFavorites')} />
              </CardShell>
            ) : (
              <ul className="overflow-hidden rounded-lg border border-line bg-elevated">
                {favorites.map((doc, i) => (
                  <li key={doc.id} className={i > 0 ? 'border-t border-line' : ''}>
                    <DocRow doc={doc} spaces={spaces} meta={fmtTime(doc.updated_at)} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* 全部空间 */}
        <section aria-labelledby="spaces-title" className="mt-10">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="spaces-title" className="text-sm font-semibold text-fg-secondary">
              {t('home.spaces')}
            </h2>
            {spaces !== null && spaces.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setNewSpaceOpen(true)}>
                <FolderPlus size={14} aria-hidden />
                {t('home.newSpace')}
              </Button>
            )}
          </div>

          {spaces === null ? (
            <div className="flex justify-center py-10">
              <Spinner size={20} />
            </div>
          ) : spaces.length === 0 ? (
            <CardShell>
              <Empty
                icon={<FolderPlus size={22} aria-hidden />}
                title={t('home.emptySpaces')}
                action={
                  <Button variant="primary" onClick={() => setNewSpaceOpen(true)}>
                    {t('home.createFirstSpace')}
                  </Button>
                }
              />
            </CardShell>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {spaces.map((sp) => (
                <button
                  key={sp.id}
                  type="button"
                  onClick={() => navigate(`/s/${sp.key}`)}
                  className="group rounded-lg border border-line bg-elevated p-4 text-left shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-primary-soft text-primary">
                      <FileText size={17} aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium group-hover:text-primary">{sp.name}</p>
                      <p className="text-2xs text-fg-muted">
                        {t('home.docsCount', { count: sp.doc_count })}
                      </p>
                    </div>
                  </div>
                  {sp.description && (
                    <p className="mt-2.5 line-clamp-2 text-2xs leading-relaxed text-fg-secondary">
                      {sp.description}
                    </p>
                  )}
                </button>
              ))}
            </div>
          )}
        </section>

        <footer className="mt-12 pb-6 text-center">
          <Link to="/search" className="text-2xs text-fg-muted underline-offset-2 hover:text-fg-secondary hover:underline">
            {t('common.search')}
          </Link>
        </footer>
      </div>

      <NewSpaceModal
        open={newSpaceOpen}
        onClose={() => setNewSpaceOpen(false)}
        onCreated={(sp) => {
          setNewSpaceOpen(false);
          void reloadSpaces();
          navigate(`/s/${sp.key}`);
        }}
      />
    </div>
  );
}

function CardShell({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-line bg-elevated">{children}</div>;
}

function DocRow({ doc, spaces, meta }: { doc: Document; spaces: Space[] | null; meta: string }) {
  // 路由以空间 key 定位，从已加载的空间列表反查
  const spaceKey = spaces?.find((sp) => sp.id === doc.space_id)?.key;
  const to = spaceKey ? `/s/${spaceKey}/d/${doc.id}` : '';
  return (
    <Link
      to={to}
      className={`flex items-center gap-2.5 px-3.5 py-2.5 transition-colors duration-150 hover:bg-hover ${to ? '' : 'pointer-events-none opacity-60'}`}
    >
      <FileText size={15} aria-hidden className="shrink-0 text-fg-muted" />
      <span className="min-w-0 flex-1 truncate text-sm">{doc.title || doc.slug}</span>
      {meta && <span className="shrink-0 text-2xs tabular-nums text-fg-muted">{meta}</span>}
    </Link>
  );
}
