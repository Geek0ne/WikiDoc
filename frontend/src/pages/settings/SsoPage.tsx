import { useEffect, useState } from 'react';
import { useT } from '../../i18n';
import { useAuthStore } from '../../stores/auth';
import { toast } from '../../stores/toast';
import { Input, Switch } from '../../components/ui';
import { Field, FormActions, SECRET_MASK } from '../../components/settings/SettingField';
import { getSettings, updateSettings } from '../../api/settings';
import { NoAdminBlock } from './AppearancePage';

/** OIDC 单点登录配置：Issuer / Client 凭据 / 回调与 Scope */
export default function SsoPage() {
  const { t } = useT();
  const isAdmin = useAuthStore((s) => s.user?.is_admin) === 1;
  const [form, setForm] = useState<Record<string, string> | null>(null);
  const [initial, setInitial] = useState<Record<string, string> | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    void getSettings()
      .then((res) => {
        setForm(res.settings);
        setInitial(res.settings);
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : t('toast.networkError')));
  }, [isAdmin, t]);

  if (!isAdmin) return <NoAdminBlock />;
  if (!form) return <p className="py-8 text-center text-2xs text-fg-muted">…</p>;

  const KEYS = ['oidc.enabled', 'oidc.name', 'oidc.issuer', 'oidc.clientId', 'oidc.clientSecret', 'oidc.redirectUri', 'oidc.scope'];
  const setKey = (key: string, value: string): void => setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  const dirty = initial !== null && KEYS.some((k) => form[k] !== initial[k]);

  const save = async (): Promise<void> => {
    setSaving(true);
    try {
      const res = await updateSettings({
        'oidc.enabled': form['oidc.enabled'] ?? 'false',
        'oidc.name': form['oidc.name'] ?? 'SSO',
        'oidc.issuer': form['oidc.issuer'] ?? '',
        'oidc.clientId': form['oidc.clientId'] ?? '',
        'oidc.clientSecret': form['oidc.clientSecret'] ?? '',
        'oidc.redirectUri': form['oidc.redirectUri'] ?? '',
        'oidc.scope': form['oidc.scope'] ?? 'openid profile email',
      });
      setForm(res.settings);
      setInitial(res.settings);
      toast.success(t('toast.saved'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('toast.networkError'));
    } finally {
      setSaving(false);
    }
  };

  const reset = (): void => {
    if (initial) setForm({ ...initial });
  };

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-sm font-semibold">{t('settings.sso')}</h1>
        <Switch checked={form['oidc.enabled'] === 'true'} onChange={(v) => setKey('oidc.enabled', String(v))} aria-label={t('settings.oidcEnable')} />
      </header>
      <p className="rounded bg-bg-sunken px-3 py-2 text-2xs leading-relaxed text-fg-muted">{t('settings.maskHint')}</p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label={t('settings.oidcName')}>
          <Input value={form['oidc.name'] ?? ''} onChange={(e) => setKey('oidc.name', e.target.value)} placeholder="SSO" />
        </Field>
        <Field label={t('settings.oidcIssuer')}>
          <Input value={form['oidc.issuer'] ?? ''} onChange={(e) => setKey('oidc.issuer', e.target.value)} placeholder="https://idp.example.com" />
        </Field>
      </div>
      <Field label={t('settings.oidcClientId')}>
        <Input value={form['oidc.clientId'] ?? ''} onChange={(e) => setKey('oidc.clientId', e.target.value)} />
      </Field>
      <Field label={t('settings.oidcClientSecret')}>
        <Input type="password" value={form['oidc.clientSecret'] ?? ''} onChange={(e) => setKey('oidc.clientSecret', e.target.value)} placeholder={form['oidc.clientSecret'] === SECRET_MASK ? SECRET_MASK : ''} autoComplete="new-password" />
      </Field>
      <Field label={t('settings.oidcRedirectUri')} hint="/#/sso-done">
        <Input value={form['oidc.redirectUri'] ?? ''} onChange={(e) => setKey('oidc.redirectUri', e.target.value)} />
      </Field>
      <Field label={t('settings.oidcScope')}>
        <Input value={form['oidc.scope'] ?? ''} onChange={(e) => setKey('oidc.scope', e.target.value)} placeholder="openid profile email" />
      </Field>

      <FormActions dirty={dirty} saving={saving} onSave={() => void save()} onCancel={reset} saveLabel={t('common.save')} cancelLabel={t('common.cancel')} />
    </div>
  );
}
