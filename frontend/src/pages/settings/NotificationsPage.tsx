import { useCallback, useEffect, useState } from 'react';
import { Plus, Send, Trash2 } from 'lucide-react';
import { useT } from '../../i18n';
import { useAuthStore } from '../../stores/auth';
import { toast } from '../../stores/toast';
import { Button, ConfirmDialog, Input, Modal, Select, Spinner, Switch } from '../../components/ui';
import { Field } from '../../components/settings/SettingField';
import {
  createChannel,
  deleteChannel,
  listChannels,
  listEvents,
  listSubscriptions,
  replaceSubscriptions,
  testChannel,
  updateChannel,
} from '../../api/notifications';
import type { NotificationChannel, NotificationSubscription, Paged } from '../../types/api';
import { request } from '../../api/client';

type ChannelType = NotificationChannel['type'];

/** 通知设置：企微/飞书/邮件渠道管理 + 事件订阅矩阵 + 发送日志 */
export default function NotificationsPage() {
  const { t } = useT();
  const isAdmin = useAuthStore((s) => s.user?.is_admin) === 1;
  const [channels, setChannels] = useState<NotificationChannel[] | null>(null);
  const [dialog, setDialog] = useState<NotificationChannel | 'new' | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<NotificationChannel | null>(null);

  const load = useCallback(() => {
    setChannels(null);
    void listChannels()
      .then((res) => setChannels(res.items))
      .catch((err) => toast.error(err instanceof Error ? err.message : t('toast.networkError')));
  }, [t]);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  return (
    <div className="space-y-8">
      {/* 个人订阅对所有登录用户开放 */}
      <SubscriptionsSection channels={channels} />

      {!isAdmin ? <AdminOnlyChannels /> : (
        <section className="space-y-3 border-t border-line pt-6">
          <header className="flex items-center justify-between gap-3">
            <h1 className="text-sm font-semibold">{t('settings.channels')}</h1>
            <Button size="sm" onClick={() => setDialog('new')}>
              <Plus size={13} aria-hidden />
              {t('settings.newChannel')}
            </Button>
          </header>

          {channels === null ? (
            <div className="flex justify-center py-8">
              <Spinner size={18} />
            </div>
          ) : channels.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-2xs text-fg-muted">{t('settings.newChannel')}</p>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
              {channels.map((ch) => (
                <li key={ch.id} className="group flex items-center gap-3 px-3 py-2.5 hover:bg-bg-elevated">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-xs font-medium text-fg">
                      {ch.name}
                      <span className="rounded bg-bg-sunken px-1 py-px text-2xs text-fg-muted">{ch.type}</span>
                      {!ch.enabled && <span className="text-2xs text-fg-muted">{t('settings.inactive')}</span>}
                    </p>
                    <p className="truncate text-2xs text-fg-muted">
                      {ch.type === 'email' ? (ch.config.recipients ?? []).join(', ') : ch.config.webhook}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => void testChannel(ch.id).then((r) => (r.ok ? toast.success(t('settings.testOk')) : toast.error(t('settings.testFailed'))))}>
                    <Send size={12} aria-hidden />
                    {t('settings.test')}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setDialog(ch)}>
                    {t('common.edit')}
                  </Button>
                  <Button variant="ghost" size="sm" aria-label={t('common.delete')} onClick={() => setDeleteTarget(ch)}>
                    <Trash2 size={12} aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <SendLogsSection />

          {dialog !== null && (
            <ChannelDialog
              channel={dialog === 'new' ? null : dialog}
              onClose={() => setDialog(null)}
              onSaved={() => {
                setDialog(null);
                load();
              }}
            />
          )}
          <ConfirmDialog
            open={deleteTarget !== null}
            title={t('common.delete')}
            message={deleteTarget ? t('table.deleteConfirm', { name: deleteTarget.name }) : ''}
            onConfirm={() => {
              if (!deleteTarget) return;
              void deleteChannel(deleteTarget.id)
                .then(() => {
                  toast.success(t('toast.deleted'));
                  setDeleteTarget(null);
                  load();
                })
                .catch((err) => toast.error(err instanceof Error ? err.message : t('toast.networkError')));
            }}
            onCancel={() => setDeleteTarget(null)}
          />
        </section>
      )}
    </div>
  );
}

function AdminOnlyChannels() {
  const { t } = useT();
  return (
    <section className="border-t border-line pt-6">
      <h1 className="text-sm font-semibold">{t('settings.channels')}</h1>
      <p className="mt-1.5 text-2xs text-fg-muted">{t('settings.noPermHint')}</p>
    </section>
  );
}

/** 新建/编辑渠道：按类型展示 webhook 或收件邮箱 */
function ChannelDialog({ channel, onClose, onSaved }: { channel: NotificationChannel | null; onClose(): void; onSaved(): void }) {
  const { t } = useT();
  const isEdit = channel !== null;
  const [name, setName] = useState(channel?.name ?? '');
  const [type, setType] = useState<ChannelType>(channel?.type ?? 'wecom');
  const [webhook, setWebhook] = useState(channel?.config.webhook ?? '');
  const [recipients, setRecipients] = useState((channel?.config.recipients ?? []).join(', '));
  const [enabled, setEnabled] = useState(channel?.enabled ?? true);
  const [saving, setSaving] = useState(false);

  const submit = async (): Promise<void> => {
    setSaving(true);
    const config = type === 'email' ? { recipients: recipients.split(/[,，]/).map((s) => s.trim()).filter(Boolean) } : { webhook };
    try {
      if (isEdit) await updateChannel(channel.id, { name: name.trim(), config, enabled });
      else await createChannel({ name: name.trim(), type, config, enabled });
      toast.success(t('toast.saved'));
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('toast.networkError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={isEdit ? t('common.edit') : t('settings.newChannel')}>
      <div className="space-y-3.5">
        <Field label={t('settings.channelName')}>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        {!isEdit && (
          <Field label={t('settings.channelType')}>
            <Select
              value={type}
              onChange={(e) => setType(e.target.value as ChannelType)}
              options={[
                { value: 'wecom', label: '企业微信' },
                { value: 'feishu', label: '飞书' },
                { value: 'email', label: '邮件' },
              ]}
            />
          </Field>
        )}
        {type === 'email' ? (
          <Field label={t('settings.recipients')}>
            <Input value={recipients} onChange={(e) => setRecipients(e.target.value)} placeholder="a@corp.com, b@corp.com" />
          </Field>
        ) : (
          <Field label={t('settings.webhookUrl')}>
            <Input value={webhook} onChange={(e) => setWebhook(e.target.value)} placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=…" />
          </Field>
        )}
        <div className="flex items-center justify-between gap-4">
          <span className="text-xs text-fg-secondary">{t('settings.active')}</span>
          <Switch checked={enabled} onChange={setEnabled} aria-label={t('settings.active')} />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button disabled={saving || !name.trim()} onClick={() => void submit()}>
            {t('common.save')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** 我的订阅：事件 × 渠道勾选矩阵，整体替换保存 */
function SubscriptionsSection({ channels }: { channels: NotificationChannel[] | null }) {
  const { t } = useT();
  const [subs, setSubs] = useState<NotificationSubscription[] | null>(null);
  const [events, setEvents] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    void Promise.all([listSubscriptions(), listEvents()])
      .then(([subRes, evRes]) => {
        setSubs(subRes.items);
        setEvents(evRes.items);
      })
      .catch(() => {
        setSubs([]);
        setEvents([]);
      });
  }, []);

  if (subs === null) return null;
  const chanList = channels ?? [];
  const isChecked = (channelId: number, eventType: string): boolean =>
    subs.some((s) => s.channelId === channelId && s.eventType === eventType && s.enabled);

  const toggle = (channelId: number, eventType: string, next: boolean): void => {
    setDirty(true);
    setSubs((prev) => {
      const rest = (prev ?? []).filter((s) => !(s.channelId === channelId && s.eventType === eventType));
      return next ? [...rest, { channelId, eventType, enabled: true }] : rest;
    });
  };

  const save = (): void => {
    void replaceSubscriptions(subs)
      .then(() => {
        setDirty(false);
        toast.success(t('toast.saved'));
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : t('toast.networkError')));
  };

  return (
    <section className="space-y-3">
      <header>
        <h1 className="text-sm font-semibold">{t('settings.mySubscriptions')}</h1>
        <p className="mt-0.5 text-2xs text-fg-muted">{t('settings.subscribeHint')}</p>
      </header>
      {chanList.length === 0 ? (
        <p className="text-2xs text-fg-muted">—</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-line bg-bg-elevated text-2xs text-fg-muted">
                <th className="px-3 py-2 font-medium">{t('notif.title')}</th>
                {chanList.map((c) => (
                  <th key={c.id} className="px-3 py-2 font-medium">{c.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => (
                <tr key={ev} className="border-b border-line last:border-b-0">
                  <td className="px-3 py-1.5 font-mono text-2xs text-fg-secondary">{ev}</td>
                  {chanList.map((c) => (
                    <td key={c.id} className="px-3 py-1.5">
                      <Switch checked={isChecked(c.id, ev)} onChange={(v) => toggle(c.id, ev, v)} aria-label={`${c.name} ${ev}`} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {dirty && (
        <div className="flex justify-end">
          <Button size="sm" onClick={save}>
            {t('common.save')}
          </Button>
        </div>
      )}
    </section>
  );
}

/** 发送日志（最近 20 条，管理端） */
interface SendLogRow {
  id: number;
  channelId: number | null;
  channelName: string | null;
  eventType: string;
  target: string | null;
  subject: string | null;
  status: string;
  error: string | null;
  sentAt: string;
}

function SendLogsSection() {
  const { t } = useT();
  const [logs, setLogs] = useState<SendLogRow[] | null>(null);

  useEffect(() => {
    void request<Paged<SendLogRow>>('/api/notifications/logs?page=1&limit=20')
      .then((res) => setLogs(res.items))
      .catch(() => setLogs([]));
  }, [t]);

  if (logs === null) return null;
  return (
    <div className="space-y-2">
      <h2 className="text-2xs font-semibold uppercase tracking-wider text-fg-muted">{t('settings.sendLogs')}</h2>
      <div className="overflow-hidden rounded-lg border border-line">
        <table className="w-full text-left text-xs">
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-center text-2xs text-fg-muted">—</td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="border-b border-line last:border-b-0">
                  <td className="px-3 py-1.5 font-mono text-2xs text-fg-muted">{log.sentAt}</td>
                  <td className="px-3 py-1.5 text-2xs text-fg-secondary">{log.eventType}</td>
                  <td className="max-w-[180px] truncate px-3 py-1.5 text-2xs text-fg-secondary">{log.target}</td>
                  <td className={`px-3 py-1.5 text-2xs ${log.status === 'success' ? 'text-success' : 'text-danger'}`}>{log.status}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
