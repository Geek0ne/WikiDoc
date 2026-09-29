import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell,
  BookOpen,
  ChevronLeft,
  ExternalLink,
  FolderPlus,
  Globe,
  Import as ImportIcon,
  KeyRound,
  LogOut,
  Menu,
  Moon,
  Monitor,
  PanelLeftClose,
  Search,
  Settings,
  Sun,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import { useT } from '../../i18n';
import { useAuthStore } from '../../stores/auth';
import { useThemeStore } from '../../stores/theme';
import { readPrefs, writePrefs } from '../../stores/prefs';
import { toast } from '../../stores/toast';
import * as spacesApi from '../../api/spaces';
import * as authApi from '../../api/auth';
import { ApiError } from '../../api/client';
import type { Space } from '../../types/api';
import {
  Avatar,
  Button,
  ConfirmDialog,
  Dropdown,
  DropdownDivider,
  DropdownItem,
  Input,
  Modal,
  Select,
  Spinner,
  Textarea,
  Tooltip,
} from '../ui';

export function AppLayout() {
  const { t, locale, setLocale } = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const [collapsed, setCollapsed] = useState(() => readPrefs().sidebarCollapsed ?? false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [spaces, setSpaces] = useState<Space[] | null>(null);
  const [newSpaceOpen, setNewSpaceOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);

  // 路由切换后收起移动端抽屉
  useEffect(() => setMobileOpen(false), [location.pathname]);

  const loadSpaces = useCallback(async () => {
    try {
      const res = await spacesApi.listSpaces();
      setSpaces(res.items);
    } catch (err) {
      setSpaces([]);
      if (err instanceof ApiError && err.status === 403) toast.warning(t('toast.forbidden'));
      else toast.error(err instanceof Error ? err.message : t('toast.networkError'));
    }
  }, [t]);

  useEffect(() => void loadSpaces(), [loadSpaces]);

  const toggleCollapsed = (): void => {
    setCollapsed((v) => {
      writePrefs({ sidebarCollapsed: !v });
      return !v;
    });
  };

  const cycleTheme = useThemeStore((s) => s.cycleTheme);
  const theme = useThemeStore((s) => s.theme);
  const ThemeIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;
  const themeLabel = theme === 'light' ? t('settings.themeLight') : theme === 'dark' ? t('settings.themeDark') : t('settings.themeSystem');

  const onLogout = async (): Promise<void> => {
    setLogoutOpen(false);
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex h-screen min-h-0 w-full overflow-hidden bg-bg text-fg">
      {/* 移动端遮罩 */}
      {mobileOpen && (
        <div className="fixed inset-0 z-modal-backdrop bg-black/40 md:hidden" onClick={() => setMobileOpen(false)} aria-hidden />
      )}

      {/* 侧栏 */}
      <aside
        className={
          `fixed inset-y-0 left-0 z-modal flex flex-col border-r border-line bg-elevated transition-[width,transform] duration-150 ease-out md:static md:translate-x-0 ` +
          (collapsed ? 'w-14' : 'w-60') +
          (mobileOpen ? ' translate-x-0' : ' -translate-x-full')
        }
      >
        {/* Logo */}
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-3">
          <Link to="/" className="flex min-w-0 items-center gap-2" aria-label="WikiDoc">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-primary text-primary-fg">
              <BookOpen size={17} aria-hidden />
            </span>
            {!collapsed && <span className="truncate text-base font-semibold tracking-tight">WikiDoc</span>}
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="ml-auto flex h-8 w-8 items-center justify-center rounded text-fg-muted hover:bg-hover md:hidden"
            aria-label={t('common.close')}
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        {/* 新建空间 */}
        <div className="px-2 py-2">
          {collapsed ? (
            <Tooltip content={t('nav.newSpace')} placement="bottom">
              <Button size="icon" variant="primary" className="mx-auto h-8 w-8" onClick={() => setNewSpaceOpen(true)} aria-label={t('nav.newSpace')}>
                <FolderPlus size={16} aria-hidden />
              </Button>
            </Tooltip>
          ) : (
            <Button size="sm" variant="primary" className="w-full justify-start" onClick={() => setNewSpaceOpen(true)}>
              <FolderPlus size={15} aria-hidden />
              {t('nav.newSpace')}
            </Button>
          )}
        </div>

        {/* 空间列表 */}
        <nav className="flex-1 overflow-y-auto px-2 pb-2" aria-label={t('nav.spaces')}>
          {spaces === null ? (
            <div className="flex justify-center py-6">
              <Spinner size={18} />
            </div>
          ) : spaces.length === 0 ? (
            <p className="px-2 py-4 text-2xs leading-relaxed text-fg-muted">{t('home.emptySpaces')}</p>
          ) : (
            <ul className="space-y-0.5">
              {spaces.map((sp) => {
                const active = location.pathname.startsWith(`/s/${sp.key}/`) || location.pathname === `/s/${sp.key}`;
                return (
                  <li key={sp.id}>
                    <Link
                      to={`/s/${sp.key}`}
                      title={collapsed ? sp.name : undefined}
                      className={
                        `flex items-center gap-2.5 rounded px-2 py-1.5 text-sm transition-colors duration-150 ` +
                        (active
                          ? 'bg-primary-soft font-medium text-primary'
                          : 'text-fg-secondary hover:bg-hover hover:text-fg')
                      }
                    >
                      <BookOpen size={15} aria-hidden className="shrink-0" />
                      {!collapsed && <span className="truncate">{sp.name}</span>}
                      {!collapsed && sp.doc_count > 0 && (
                        <span className="ml-auto text-2xs tabular-nums text-fg-muted">{sp.doc_count}</span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </nav>

        {/* 底部工具 */}
        <div className="space-y-0.5 border-t border-line px-2 py-2">
          <SidebarLink to="/import" icon={<ImportIcon size={15} aria-hidden />} label={t('nav.import')} collapsed={collapsed} />
          <SidebarLink to="/trash" icon={<Trash2 size={15} aria-hidden />} label={t('nav.trash')} collapsed={collapsed} />
          <SidebarLink to="/settings" icon={<Settings size={15} aria-hidden />} label={t('nav.settings')} collapsed={collapsed} />
          <button
            type="button"
            onClick={toggleCollapsed}
            className={`hidden w-full items-center gap-2.5 rounded px-2 py-1.5 text-sm text-fg-secondary transition-colors duration-150 hover:bg-hover hover:text-fg md:flex ${collapsed ? 'justify-center' : ''}`}
            aria-label={collapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
          >
            {collapsed ? <ChevronLeft size={15} aria-hidden className="rotate-180" /> : <PanelLeftClose size={15} aria-hidden />}
            {!collapsed && t('nav.collapseSidebar')}
          </button>
        </div>
      </aside>

      {/* 右侧主区 */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* 顶栏 */}
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-elevated px-3 md:px-4">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded text-fg-secondary transition-colors duration-150 hover:bg-hover md:hidden"
            aria-label={t('nav.openMenu')}
          >
            <Menu size={18} aria-hidden />
          </button>

          {/* 全站搜索 */}
          <TopSearch />

          <div className="ml-auto flex items-center gap-1">
            {/* 通知 */}
            <Dropdown
              align="right"
              trigger={(open) => (
                <button
                  type="button"
                  aria-label={t('notif.title')}
                  className={`relative flex h-9 w-9 items-center justify-center rounded transition-colors duration-150 hover:bg-hover ${open ? 'bg-hover text-fg' : 'text-fg-secondary'}`}
                >
                  <Bell size={17} aria-hidden />
                </button>
              )}
            >
              <div className="w-72 px-3 py-2">
                <p className="mb-1 text-2xs font-medium text-fg-secondary">{t('notif.title')}</p>
                <p className="text-2xs leading-relaxed text-fg-muted">{t('notif.emptyHint')}</p>
                <div className="mt-2 border-t border-line pt-2">
                  <Link to="/settings/notifications" className="flex items-center gap-1.5 text-2xs text-primary hover:underline">
                    <ExternalLink size={12} aria-hidden />
                    {t('notif.manageSubscriptions')}
                  </Link>
                </div>
              </div>
            </Dropdown>

            {/* 主题 */}
            <Tooltip content={themeLabel} placement="bottom">
              <button
                type="button"
                onClick={cycleTheme}
                aria-label={themeLabel}
                className="flex h-9 w-9 items-center justify-center rounded text-fg-secondary transition-colors duration-150 hover:bg-hover"
              >
                <ThemeIcon size={17} aria-hidden />
              </button>
            </Tooltip>

            {/* 语言 */}
            <Tooltip content={locale === 'zh-CN' ? '中文 / English' : '中文 / English'} placement="bottom">
              <button
                type="button"
                onClick={() => setLocale(locale === 'zh-CN' ? 'en' : 'zh-CN')}
                aria-label={t('settings.language')}
                className="flex h-9 w-9 items-center justify-center rounded text-fg-secondary transition-colors duration-150 hover:bg-hover"
              >
                <Globe size={17} aria-hidden />
              </button>
            </Tooltip>

            {/* 用户菜单 */}
            {user && (
              <Dropdown
                align="right"
                trigger={(open) => (
                  <button
                    type="button"
                    aria-label={t('settings.account')}
                    className={`ml-1 flex items-center gap-2 rounded-full p-0.5 pr-2 transition-colors duration-150 hover:bg-hover ${open ? 'bg-hover' : ''}`}
                  >
                    <Avatar name={user.display_name || user.username} src={user.avatar_url} size={28} />
                    <span className="hidden max-w-24 truncate text-sm text-fg-secondary sm:block">
                      {user.display_name || user.username}
                    </span>
                  </button>
                )}
              >
                <div className="px-3 py-2">
                  <p className="truncate text-sm font-medium">{user.display_name || user.username}</p>
                  <p className="truncate text-2xs text-fg-muted">
                    {user.email ?? user.username}
                    {user.is_admin === 1 ? ' · admin' : ''}
                  </p>
                </div>
                <DropdownDivider />
                <DropdownItem icon={<UserRound size={15} aria-hidden />} onClick={() => setProfileOpen(true)}>
                  {t('settings.profile')}
                </DropdownItem>
                <DropdownItem icon={<KeyRound size={15} aria-hidden />} onClick={() => setPasswordOpen(true)}>
                  {t('settings.changePassword')}
                </DropdownItem>
                <DropdownDivider />
                <DropdownItem icon={<LogOut size={15} aria-hidden />} danger onClick={() => setLogoutOpen(true)}>
                  {t('settings.logout')}
                </DropdownItem>
              </Dropdown>
            )}
          </div>
        </header>

        {/* 内容区 */}
        <main className="min-h-0 flex-1 overflow-hidden">
          <Outlet context={{ reloadSpaces: loadSpaces }} />
        </main>
      </div>

      {/* 弹窗组 */}
      <NewSpaceModal
        open={newSpaceOpen}
        onClose={() => setNewSpaceOpen(false)}
        onCreated={(sp) => {
          setNewSpaceOpen(false);
          void loadSpaces();
          navigate(`/s/${sp.key}`);
        }}
      />
      <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />
      <PasswordModal open={passwordOpen} onClose={() => setPasswordOpen(false)} />
      <ConfirmDialog
        open={logoutOpen}
        title={t('settings.logout')}
        message={t('settings.logoutConfirm')}
        danger
        onConfirm={() => void onLogout()}
        onCancel={() => setLogoutOpen(false)}
      />
    </div>
  );
}

function SidebarLink({
  to,
  icon,
  label,
  collapsed,
}: {
  to: string;
  icon: ReactNode;
  label: string;
  collapsed: boolean;
}) {
  const link = (
    <Link
      to={to}
      className={`flex items-center gap-2.5 rounded px-2 py-1.5 text-sm text-fg-secondary transition-colors duration-150 hover:bg-hover hover:text-fg ${collapsed ? 'justify-center' : ''}`}
    >
      {icon}
      {!collapsed && label}
    </Link>
  );
  return collapsed ? (
    <Tooltip content={label} placement="bottom">
      {link}
    </Tooltip>
  ) : (
    link
  );
}

/** 顶栏搜索框：回车跳转 /search?q= */
function TopSearch() {
  const { t } = useT();
  const navigate = useNavigate();
  const [value, setValue] = useState('');

  const submit = (e: FormEvent): void => {
    e.preventDefault();
    const q = value.trim();
    if (q) navigate(`/search?q=${encodeURIComponent(q)}`);
  };

  return (
    <form onSubmit={submit} className="relative w-full max-w-md" role="search">
      <Search size={15} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted" />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t('search.placeholder')}
        aria-label={t('common.search')}
        className="h-9 w-full rounded border border-line bg-bg pl-9 pr-3 text-sm text-fg placeholder:text-fg-muted transition-[border-color,box-shadow] duration-150 focus:border-primary focus:shadow-[var(--focus-ring)] focus:outline-none"
      />
    </form>
  );
}

/** 新建空间弹窗 */
export function NewSpaceModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (space: Space) => void;
}) {
  const { t } = useT();
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<'inherit' | 'public' | 'space' | 'private'>('space');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const reset = (): void => {
    setKey('');
    setName('');
    setDescription('');
    setVisibility('space');
    setError(null);
  };

  const submit = async (): Promise<void> => {
    if (!key.trim() || !name.trim()) {
      setError(t('common.required'));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await spacesApi.createSpace({
        key: key.trim(),
        name: name.trim(),
        description: description.trim() || undefined,
        visibility,
      });
      toast.success(t('toast.created'));
      reset();
      onCreated(res.space);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('toast.networkError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title={t('nav.newSpace')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" loading={loading} onClick={() => void submit()}>
            {t('common.create')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input
          label={t('space.rename')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="产品团队"
        />
        <Input
          label="Key"
          value={key}
          onChange={(e) => setKey(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
          placeholder="product-team"
        />
        <Textarea
          label={t('space.description')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('space.description')}
        />
        <Select
          label={t('space.visibility')}
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as typeof visibility)}
          options={[
            { value: 'space', label: t('space.visibilitySpace') },
            { value: 'public', label: t('space.visibilityPublic') },
            { value: 'private', label: t('space.visibilityPrivate') },
            { value: 'inherit', label: t('space.visibilityInherit') },
          ]}
        />
        {error && <p className="text-2xs text-danger">{error}</p>}
      </div>
    </Modal>
  );
}

/** 个人资料弹窗 */
function ProfileModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && user) {
      setDisplayName(user.display_name);
      setEmail(user.email ?? '');
    }
  }, [open, user]);

  const submit = async (): Promise<void> => {
    setLoading(true);
    try {
      const res = await authApi.updateProfile({ display_name: displayName.trim(), email: email.trim() });
      setUser(res.user);
      toast.success(t('toast.profileSaved'));
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('toast.networkError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('settings.profile')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" loading={loading} onClick={() => void submit()}>
            {t('settings.saveProfile')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input label={t('auth.username')} value={user?.username ?? ''} disabled />
        <Input label={t('settings.displayName')} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        <Input label={t('settings.email')} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
    </Modal>
  );
}

/** 修改密码弹窗：后端改密会吊销全部会话，成功后强制重新登录 */
function PasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT();
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (): Promise<void> => {
    if (!oldPwd || !newPwd) {
      setError(t('common.required'));
      return;
    }
    if (newPwd !== confirmPwd) {
      setError(t('auth.passwordRequired'));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await authApi.changePassword({ old_password: oldPwd, new_password: newPwd });
      toast.success(t('toast.passwordChanged'));
      onClose();
      await logout();
      navigate('/login', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('toast.networkError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('settings.changePassword')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" loading={loading} onClick={() => void submit()}>
            {t('common.confirm')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input label={t('settings.oldPassword')} type="password" value={oldPwd} onChange={(e) => setOldPwd(e.target.value)} />
        <Input label={t('settings.newPassword')} type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} />
        <Input
          label={t('settings.newPassword')}
          type="password"
          value={confirmPwd}
          onChange={(e) => setConfirmPwd(e.target.value)}
        />
        {error && <p className="text-2xs text-danger">{error}</p>}
      </div>
    </Modal>
  );
}
