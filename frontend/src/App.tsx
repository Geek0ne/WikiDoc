import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { HashRouter } from 'react-router-dom';
import { I18nProvider } from './i18n';
import { initTheme } from './stores/theme';
import { bindUnauthorizedHandler } from './stores/auth';
import { AppRoutes } from './router';
import { ToastViewport } from './components/ui';

/** 应用根：装配主题、i18n、路由与会话失效回调 */
export default function App() {
  useEffect(() => initTheme(), []);

  return (
    <I18nProvider>
      <HashRouter>
        <SessionBinding />
        <AppRoutes />
        <ToastViewport />
      </HashRouter>
    </I18nProvider>
  );
}

/** 在 Router 上下文内注册 401 外跳（client 层不能直接用 navigate） */
function SessionBinding() {
  const navigate = useNavigate();
  useEffect(() => {
    bindUnauthorizedHandler(() => navigate('/login', { replace: true }));
  }, [navigate]);
  return null;
}
