import { useEffect, type ReactNode } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useAuthStore } from './stores/auth';
import { useT } from './i18n';
import { AppLayout } from './components/layout/AppLayout';
import { FullScreenSpinner } from './components/ui';
import LoginPage from './pages/LoginPage';
import SsoDonePage from './pages/SsoDonePage';
import HomePage from './pages/HomePage';
import SpacePage from './pages/SpacePage';
import SearchPage from './pages/SearchPage';
import TrashPage from './pages/TrashPage';
import ImportPage from './pages/ImportPage';
import EditorPage from './pages/EditorPage';
import { SettingsRouter } from './pages/settings';

/** 会话探测完成前挂起渲染；确认未登录时跳登录页（记住来源路径） */
function RequireAuth({ children }: { children?: ReactNode }) {
  const status = useAuthStore((s) => s.status);
  const location = useLocation();

  if (status === 'loading') return <FullScreenSpinner />;
  if (status === 'guest') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return children ?? <Outlet />;
}

function RouterShell() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/sso-done" element={<SsoDonePage />} />

      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<HomePage />} />
          {/* 空间页与文档页共用骨架：树常驻，右侧按 docId 切换欢迎页/文档视图 */}
          <Route path="/s/:key" element={<SpacePage />} />
          <Route path="/s/:key/d/:docId" element={<SpacePage />} />
          <Route path="/s/:key/d/:docId/edit" element={<EditorPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/trash" element={<TrashPage />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/settings/*" element={<SettingsRouter />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export function AppRoutes() {
  const init = useAuthStore((s) => s.init);
  const status = useAuthStore((s) => s.status);
  const { t } = useT();

  useEffect(() => {
    void init();
  }, [init]);

  // 首次探测会话期间整页挂起，避免登录页与工作台闪跳
  if (status === 'loading') {
    return <FullScreenSpinner label={t('common.loading')} />;
  }
  return <RouterShell />;
}
