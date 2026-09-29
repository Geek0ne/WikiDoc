import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { useT } from '../i18n';
import { useAuthStore } from '../stores/auth';

/**
 * SSO 回调落点：服务端 /auth/sso/callback 校验成功后重定向到 /#/sso-done，
 * refresh cookie 已就绪；这里静默调 fetchMe（内部会单飞刷新）换取会话。
 */
export default function SsoDonePage() {
  const { t } = useT();
  const navigate = useNavigate();
  const init = useAuthStore((s) => s.init);
  const [phase, setPhase] = useState<'doing' | 'done' | 'failed'>('doing');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async (): Promise<void> => {
      try {
        // 先主动刷新一次确保 access token 落地，再探测会话
        const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
        const body = (await res.json()) as { code: number };
        if (body.code !== 0) throw new Error(t('sso.failed'));
        await init();
        if (!cancelled) setPhase('done');
        window.setTimeout(() => navigate('/', { replace: true }), 600);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : t('sso.failed'));
        setPhase('failed');
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [init, navigate, t]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bg px-6 text-center">
      {phase === 'doing' && (
        <>
          <Loader2 size={28} aria-hidden className="animate-spin text-primary" />
          <p className="text-sm text-fg-secondary">{t('sso.doing')}</p>
        </>
      )}
      {phase === 'done' && (
        <>
          <CheckCircle2 size={28} aria-hidden className="text-success" />
          <p className="text-sm font-medium text-fg">{t('sso.done')}</p>
        </>
      )}
      {phase === 'failed' && (
        <>
          <XCircle size={28} aria-hidden className="text-danger" />
          <p className="text-sm font-medium text-fg">{t('sso.failed')}</p>
          {error && <p className="max-w-sm text-2xs leading-relaxed text-fg-muted">{error}</p>}
          <Link
            to="/login"
            className="mt-2 text-sm text-primary underline-offset-2 hover:underline"
          >
            {t('sso.backToLogin')}
          </Link>
        </>
      )}
    </div>
  );
}
