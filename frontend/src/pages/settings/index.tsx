import { useMemo } from 'react';
import { Navigate, NavLink, useLocation } from 'react-router-dom';
import { Bell, Landmark, Palette, ScrollText, ShieldCheck, Fingerprint, UserCog, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { useT, type TKey } from '../../i18n';
import { useAuthStore } from '../../stores/auth';
import AppearancePage from './AppearancePage';
import MembersPage from './MembersPage';
import GroupsPage from './GroupsPage';
import LdapPage from './LdapPage';
import SsoPage from './SsoPage';
import NotificationsPage from './NotificationsPage';
import PermissionsPage from './PermissionsPage';
import AuditPage from './AuditPage';

/**
 * 设置区：左侧模块导航 + 右侧模块页。
 * 成员/用户组/LDAP/SSO/权限/审计仅管理员可见（后端同样校验，前端只做入口收敛）。
 */

const MODULES: { path: string; icon: ReactNode; labelKey: TKey; adminOnly: boolean }[] = [
  { path: 'appearance', icon: <Palette size={14} aria-hidden />, labelKey: 'settings.appearance', adminOnly: false },
  { path: 'notifications', icon: <Bell size={14} aria-hidden />, labelKey: 'settings.notifications', adminOnly: false },
  { path: 'members', icon: <UserCog size={14} aria-hidden />, labelKey: 'settings.members', adminOnly: true },
  { path: 'groups', icon: <Users size={14} aria-hidden />, labelKey: 'settings.groups', adminOnly: true },
  { path: 'ldap', icon: <Landmark size={14} aria-hidden />, labelKey: 'settings.ldap', adminOnly: true },
  { path: 'sso', icon: <Fingerprint size={14} aria-hidden />, labelKey: 'settings.sso', adminOnly: true },
  { path: 'permissions', icon: <ShieldCheck size={14} aria-hidden />, labelKey: 'settings.permissions', adminOnly: true },
  { path: 'audit', icon: <ScrollText size={14} aria-hidden />, labelKey: 'settings.audit', adminOnly: true },
];

const PAGE_BY_PATH: Record<string, ReactNode> = {
  appearance: <AppearancePage />,
  notifications: <NotificationsPage />,
  members: <MembersPage />,
  groups: <GroupsPage />,
  ldap: <LdapPage />,
  sso: <SsoPage />,
  permissions: <PermissionsPage />,
  audit: <AuditPage />,
};

/** 设置区路由：/settings/* 按子路径渲染对应模块 */
export function SettingsRouter() {
  const location = useLocation();
  const sub = location.pathname.replace(/^\/settings\/?/, '') || 'appearance';
  const known = MODULES.some((m) => m.path === sub);

  return (
    <SettingsShell active={known ? sub : ''}>
      {known ? PAGE_BY_PATH[sub] : <Navigate to="/settings/appearance" replace />}
    </SettingsShell>
  );
}

function SettingsShell({ active, children }: { active: string; children: ReactNode }) {
  const { t } = useT();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.is_admin === 1;
  const visible = useMemo(() => MODULES.filter((m) => isAdmin || !m.adminOnly), [isAdmin]);

  return (
    <div className="flex h-full min-h-0">
      <nav className="w-52 shrink-0 overflow-y-auto border-r border-line bg-elevated p-3" aria-label={t('settings.title')}>
        <p className="mb-2 px-2 text-2xs font-medium uppercase tracking-wider text-fg-muted">{t('settings.title')}</p>
        <ul className="space-y-0.5">
          {visible.map((m) => (
            <li key={m.path}>
              <NavLink
                to={`/settings/${m.path}`}
                className={`flex items-center gap-2.5 rounded px-2 py-1.5 text-sm transition-colors duration-150 ${
                  active === m.path
                    ? 'bg-primary-soft font-medium text-primary'
                    : 'text-fg-secondary hover:bg-hover hover:text-fg'
                }`}
              >
                {m.icon}
                {t(m.labelKey)}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-6 py-8">{children}</div>
      </div>
    </div>
  );
}
