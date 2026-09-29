import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { BookOpen, KeyRound, LogIn, UserRound } from 'lucide-react';
import { useT } from '../i18n';
import { useAuthStore } from '../stores/auth';
import * as authApi from '../api/auth';
import { Button, Input } from '../components/ui';

/** 登录页：左侧品牌区（纯 CSS 渐变网格背景）+ 右侧表单；支持本地与 SSO */
export default function LoginPage() {
  const { t } = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const status = useAuthStore((s) => s.status);
  const login = useAuthStore((s) => s.login);
  const providers = useAuthStore((s) => s.providers);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ssoLoading, setSsoLoading] = useState(false);

  // 已登录直接进入工作台
  if (status === 'authed') {
    return <Navigate to={(location.state as { from?: string } | null)?.from ?? '/'} replace />;
  }

  // SSO 失败回跳带 sso_error 参数
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const ssoError = params.get('sso_error');
    if (ssoError) setError(ssoError);
  }, [location.search]);

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!username.trim()) {
      setError(t('auth.usernameRequired'));
      return;
    }
    if (!password) {
      setError(t('auth.passwordRequired'));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await login(username.trim(), password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.loginFailed'));
    } finally {
      setLoading(false);
    }
  };

  const startSso = async (): Promise<void> => {
    setSsoLoading(true);
    setError(null);
    try {
      const { url } = await authApi.getSsoUrl();
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.loginFailed'));
      setSsoLoading(false);
    }
  };

  const localEnabled = providers ? providers.local || providers.ldap : true;
  const oidcEnabled = providers?.oidc ?? false;

  return (
    <div className="flex min-h-screen w-full bg-bg">
      {/* 品牌区 */}
      <div className="relative hidden w-[46%] overflow-hidden bg-sunken lg:block">
        {/* 纯 CSS 几何背景：主色网格 + 柔光 */}
        <div
          className="absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              'linear-gradient(var(--primary-soft-border) 1px, transparent 1px), linear-gradient(90deg, var(--primary-soft-border) 1px, transparent 1px)',
            backgroundSize: '44px 44px',
          }}
          aria-hidden
        />
        <div
          className="absolute -left-24 -top-24 h-96 w-96 rounded-full opacity-60 blur-3xl"
          style={{ background: 'radial-gradient(circle, var(--primary-soft) 0%, transparent 70%)' }}
          aria-hidden
        />
        <div
          className="absolute -bottom-32 right-0 h-[28rem] w-[28rem] rounded-full opacity-50 blur-3xl"
          style={{ background: 'radial-gradient(circle, var(--primary-soft) 0%, transparent 70%)' }}
          aria-hidden
        />
        <div className="relative flex h-full flex-col justify-between p-10">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded bg-primary text-primary-fg">
              <BookOpen size={20} aria-hidden />
            </span>
            <span className="text-xl font-semibold tracking-tight text-fg">WikiDoc</span>
          </div>
          <div className="max-w-md">
            <h1 className="text-3xl font-semibold leading-snug tracking-tight text-fg">
              {t('auth.brandSlogan')}
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-fg-secondary">{t('auth.subtitle')}</p>
            {providers?.ldap && (
              <p className="mt-4 inline-flex rounded-full border border-line bg-elevated px-3 py-1 text-2xs text-fg-secondary">
                {t('auth.ldapHint')}
              </p>
            )}
          </div>
          <p className="text-2xs text-fg-muted">WikiDoc · Enterprise Knowledge Base</p>
        </div>
      </div>

      {/* 表单区 */}
      <div className="flex flex-1 items-center justify-center px-6 py-10">
        <div className="w-full max-w-sm animate-fadeIn">
          {/* 窄屏 Logo */}
          <div className="mb-8 flex items-center justify-center gap-2.5 lg:hidden">
            <span className="flex h-9 w-9 items-center justify-center rounded bg-primary text-primary-fg">
              <BookOpen size={18} aria-hidden />
            </span>
            <span className="text-lg font-semibold tracking-tight">WikiDoc</span>
          </div>

          <h2 className="text-xl font-semibold tracking-tight text-fg">{t('auth.login')}</h2>
          <p className="mt-1 text-sm text-fg-secondary">{t('auth.subtitle')}</p>

          <form onSubmit={(e) => void submit(e)} className="mt-7 space-y-4" noValidate>
            <Input
              label={t('auth.username')}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={t('auth.usernamePlaceholder')}
              autoComplete="username"
              icon={<UserRound size={15} aria-hidden />}
              disabled={!localEnabled}
            />
            <Input
              label={t('auth.password')}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('auth.passwordPlaceholder')}
              autoComplete="current-password"
              icon={<KeyRound size={15} aria-hidden />}
              disabled={!localEnabled}
            />

            {error && (
              <p role="alert" className="rounded border border-danger bg-danger-soft px-3 py-2 text-2xs leading-relaxed text-danger">
                {error}
              </p>
            )}

            <Button
              type="submit"
              variant="primary"
              className="w-full"
              loading={loading}
              disabled={!localEnabled}
            >
              <LogIn size={15} aria-hidden />
              {loading ? t('auth.loggingIn') : t('auth.login')}
            </Button>

            {!localEnabled && <p className="text-center text-2xs text-fg-muted">{t('auth.localDisabled')}</p>}
          </form>

          {oidcEnabled && (
            <>
              <div className="my-6 flex items-center gap-3 text-2xs text-fg-muted">
                <span className="h-px flex-1 bg-line" />
                <span>SSO</span>
                <span className="h-px flex-1 bg-line" />
              </div>
              <Button variant="secondary" className="w-full" loading={ssoLoading} onClick={() => void startSso()}>
                {ssoLoading ? t('auth.ssoRedirecting') : t('auth.ssoLogin')}
                {providers?.oidcName ? ` · ${providers.oidcName}` : ''}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
