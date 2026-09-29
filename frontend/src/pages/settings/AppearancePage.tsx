import { useEffect, useState } from 'react';
import { useT } from '../../i18n';
import { useAuthStore } from '../../stores/auth';
import { toast } from '../../stores/toast';
import { Input, Select, Switch, Textarea } from '../../components/ui';
import { Field, FormActions } from '../../components/settings/SettingField';
import { getSettings, updateSettings } from '../../api/settings';
import type { TKey } from '../../i18n';

const THEMES: { value: string; labelKey: TKey }[] = [
  { value: 'graphite-light', labelKey: 'settings.themeGraphiteLight' },
  { value: 'graphite-dark', labelKey: 'settings.themeGraphiteDark' },
  { value: 'inkgreen-light', labelKey: 'settings.themeInkgreenLight' },
  { value: 'inkgreen-dark', labelKey: 'settings.themeInkgreenDark' },
  { value: 'slate-light', labelKey: 'settings.themeSlateLight' },
  { value: 'slate-dark', labelKey: 'settings.themeSlateDark' },
];

const LOCALES: { value: string; labelKey: TKey }[] = [
  { value: 'zh-CN', labelKey: 'settings.localeZh' },
  { value: 'en-US', labelKey: 'settings.localeEn' },
];

const SITE_KEYS = ['site.name', 'site.description', 'site.locale', 'site.theme', 'site.allowRegistration'] as const;

/** 站点外观与访问控制：site.* 键，写入走 PUT /api/settings */
export default function AppearancePage() {
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

  const setKey = (key: string, value: string): void => setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  const dirty = initial !== null && SITE_KEYS.some((k) => form[k] !== initial[k]);

  const save = async (): Promise<void> => {
    setSaving(true);
    try {
      const res = await updateSettings({
        'site.name': form['site.name'] ?? '',
        'site.description': form['site.description'] ?? '',
        'site.locale': form['site.locale'] ?? 'zh-CN',
        'site.theme': form['site.theme'] ?? 'graphite-light',
        'site.allowRegistration': form['site.allowRegistration'] ?? 'false',
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
    <div className="space-y-8">
      <section className="space-y-4">
        <header>
          <h1 className="text-sm font-semibold">{t('settings.siteBasic')}</h1>
          <p className="mt-0.5 text-2xs text-fg-muted">{t('settings.siteBasicHint')}</p>
        </header>
        <Field label={t('settings.siteName')}>
          <Input value={form['site.name'] ?? ''} onChange={(e) => setKey('site.name', e.target.value)} />
        </Field>
        <Field label={t('settings.siteDescription')}>
          <Textarea value={form['site.description'] ?? ''} onChange={(e) => setKey('site.description', e.target.value)} rows={2} />
        </Field>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label={t('settings.defaultLocale')}>
            <Select value={form['site.locale'] ?? 'zh-CN'} onChange={(e) => setKey('site.locale', e.target.value)} options={LOCALES.map((l) => ({ value: l.value, label: t(l.labelKey) }))} />
          </Field>
          <Field label={t('settings.defaultTheme')}>
            <Select value={form['site.theme'] ?? 'graphite-light'} onChange={(e) => setKey('site.theme', e.target.value)} options={THEMES.map((th) => ({ value: th.value, label: t(th.labelKey) }))} />
          </Field>
        </div>
        <FormActions dirty={dirty} saving={saving} onSave={() => void save()} onCancel={reset} saveLabel={t('common.save')} cancelLabel={t('common.cancel')} />
      </section>

      <section className="space-y-4 border-t border-line pt-6">
        <header>
          <h2 className="text-sm font-semibold">{t('settings.siteAccess')}</h2>
        </header>
        <div className="flex items-center justify-between gap-4">
          <span className="text-xs text-fg-secondary">{t('settings.allowRegistration')}</span>
          <Switch checked={form['site.allowRegistration'] === 'true'} onChange={(v) => setKey('site.allowRegistration', String(v))} aria-label={t('settings.allowRegistration')} />
        </div>
        <FormActions dirty={dirty} saving={saving} onSave={() => void save()} onCancel={reset} saveLabel={t('common.save')} cancelLabel={t('common.cancel')} />
      </section>
    </div>
  );
}

/** 非 admin 直链访问设置模块时的占位提示 */
export function NoAdminBlock() {
  const { t } = useT();
  return (
    <div className="rounded-lg border border-dashed border-line bg-elevated px-6 py-14 text-center">
      <h1 className="text-base font-semibold">{t('settings.needAdmin')}</h1>
      <p className="mt-1.5 text-2xs leading-relaxed text-fg-muted">{t('settings.noPermHint')}</p>
    </div>
  );
}
