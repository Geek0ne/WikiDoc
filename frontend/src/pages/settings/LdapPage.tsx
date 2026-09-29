import { useEffect, useState } from 'react';
import { PlugZap } from 'lucide-react';
import { useT } from '../../i18n';
import { useAuthStore } from '../../stores/auth';
import { toast } from '../../stores/toast';
import { Button, Input, Switch } from '../../components/ui';
import { Field, FormActions, SECRET_MASK } from '../../components/settings/SettingField';
import { getSettings, testLdap, updateSettings } from '../../api/settings';
import { NoAdminBlock } from './AppearancePage';

/** LDAP 域配置：启用开关、连接参数、密钥掩码与连接测试 */
export default function LdapPage() {
  const { t } = useT();
  const isAdmin = useAuthStore((s) => s.user?.is_admin) === 1;
  const [form, setForm] = useState<Record<string, string> | null>(null);
  const [initial, setInitial] = useState<Record<string, string> | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

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

  const KEYS = ['ldap.enabled', 'ldap.url', 'ldap.baseDn', 'ldap.bindDn', 'ldap.bindPassword', 'ldap.userFilter', 'ldap.groupFilter', 'ldap.timeoutMs', 'auth.localFallback'];
  const setKey = (key: string, value: string): void => setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  const dirty = initial !== null && KEYS.some((k) => form[k] !== initial[k]);

  const save = async (): Promise<void> => {
    setSaving(true);
    try {
      const res = await updateSettings({
        'ldap.enabled': form['ldap.enabled'] ?? 'false',
        'ldap.url': form['ldap.url'] ?? '',
        'ldap.baseDn': form['ldap.baseDn'] ?? '',
        'ldap.bindDn': form['ldap.bindDn'] ?? '',
        'ldap.bindPassword': form['ldap.bindPassword'] ?? '',
        'ldap.userFilter': form['ldap.userFilter'] ?? '',
        'ldap.groupFilter': form['ldap.groupFilter'] ?? '',
        'ldap.timeoutMs': form['ldap.timeoutMs'] ?? '8000',
        'auth.localFallback': form['auth.localFallback'] ?? 'true',
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

  const test = (): void => {
    setTesting(true);
    void testLdap()
      .then((res) => {
        if (res.ok) toast.success(t('settings.ldapOk'));
        else toast.error(t('settings.ldapNotConfigured'));
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : t('toast.networkError')))
      .finally(() => setTesting(false));
  };

  const reset = (): void => {
    if (initial) setForm({ ...initial });
  };

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-sm font-semibold">{t('settings.ldap')}</h1>
        <Switch checked={form['ldap.enabled'] === 'true'} onChange={(v) => setKey('ldap.enabled', String(v))} aria-label={t('settings.ldapEnable')} />
      </header>
      <p className="rounded bg-bg-sunken px-3 py-2 text-2xs leading-relaxed text-fg-muted">{t('settings.maskHint')}</p>

      <Field label={t('settings.ldapUrl')}>
        <Input value={form['ldap.url'] ?? ''} onChange={(e) => setKey('ldap.url', e.target.value)} placeholder="ldap://127.0.0.1:389" />
      </Field>
      <Field label={t('settings.ldapBaseDn')}>
        <Input value={form['ldap.baseDn'] ?? ''} onChange={(e) => setKey('ldap.baseDn', e.target.value)} placeholder="dc=example,dc=com" />
      </Field>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label={t('settings.ldapBindDn')}>
          <Input value={form['ldap.bindDn'] ?? ''} onChange={(e) => setKey('ldap.bindDn', e.target.value)} />
        </Field>
        <Field label={t('settings.ldapBindPassword')}>
          <Input type="password" value={form['ldap.bindPassword'] ?? ''} onChange={(e) => setKey('ldap.bindPassword', e.target.value)} placeholder={form['ldap.bindPassword'] === SECRET_MASK ? SECRET_MASK : ''} autoComplete="new-password" />
        </Field>
      </div>
      <Field label={t('settings.ldapUserFilter')}>
        <Input value={form['ldap.userFilter'] ?? ''} onChange={(e) => setKey('ldap.userFilter', e.target.value)} placeholder="(sAMAccountName={{username}})" />
      </Field>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label={t('settings.ldapGroupFilter')}>
          <Input value={form['ldap.groupFilter'] ?? ''} onChange={(e) => setKey('ldap.groupFilter', e.target.value)} placeholder="(objectClass=group)" />
        </Field>
        <Field label={t('settings.ldapTimeout')}>
          <Input type="number" value={form['ldap.timeoutMs'] ?? '8000'} onChange={(e) => setKey('ldap.timeoutMs', e.target.value)} />
        </Field>
      </div>

      <div className="flex items-center justify-between gap-4 border-t border-line pt-4">
        <span className="text-xs text-fg-secondary">{t('settings.localFallback')}</span>
        <Switch checked={form['auth.localFallback'] !== 'false'} onChange={(v) => setKey('auth.localFallback', String(v))} aria-label={t('settings.localFallback')} />
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
        <Button variant="secondary" size="sm" disabled={testing} onClick={test}>
          <PlugZap size={13} aria-hidden />
          {testing ? '…' : t('settings.testLdap')}
        </Button>
        <FormActions dirty={dirty} saving={saving} onSave={() => void save()} onCancel={reset} saveLabel={t('common.save')} cancelLabel={t('common.cancel')} />
      </div>
    </div>
  );
}
