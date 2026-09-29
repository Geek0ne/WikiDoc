/**
 * 前端侧类型。字段与 server/src/types.ts 及各 service 返回结构对齐，
 * 只保留前端用到的字段；时间戳均为 ISO 字符串。
 */

export type Permission = 1 | 2 | 3;
export type SubjectType = 'user' | 'group' | 'everyone';
export type Visibility = 'inherit' | 'public' | 'space' | 'private';
export type ThemeMode = 'light' | 'dark' | 'system';
export type AccentName = 'default' | 'forest' | 'sunset';

/** 登录/刷新接口返回的用户（服务端 sanitizeUser 后不含敏感字段） */
export interface SafeUser {
  id: number;
  username: string;
  display_name: string;
  email: string | null;
  avatar_url: string | null;
  source: 'local' | 'ldap' | 'oidc';
  is_admin: number;
  is_active: number;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LoginProviders {
  local: boolean;
  ldap: boolean;
  oidc: boolean;
  oidcName: string;
}

export interface Space {
  id: number;
  key: string;
  name: string;
  description: string | null;
  icon: string | null;
  owner_id: number;
  visibility: Visibility;
  created_at: string;
  updated_at: string;
  /** listSpaces / getSpaceByKey 附加字段 */
  doc_count: number;
  my_permission: number | null;
}

export interface Document {
  id: number;
  space_id: number;
  parent_id: number | null;
  title: string;
  slug: string;
  content_md: string;
  content_html: string | null;
  content_text: string | null;
  status: 'draft' | 'published' | 'archived';
  visibility: Visibility;
  path: string;
  sort_order: number;
  author_id: number;
  updated_by: number | null;
  version: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

/** 空间文档树节点（document.service DocTreeNode） */
export interface DocTreeNode {
  id: number;
  parent_id: number | null;
  title: string;
  status: string;
  visibility: string;
  sort_order: number;
  my_permission: number;
  has_children: boolean;
  children: DocTreeNode[];
}

/** 文档详情响应（document.service DocumentDetail） */
export interface DocumentDetail {
  doc: Document;
  my_permission: number;
  breadcrumb: { id: number; title: string }[];
}

export interface VersionRow {
  id: number;
  version: number;
  title: string;
  author_id: number;
  author_name: string | null;
  change_note: string | null;
  created_at: string;
}

export interface VersionContent {
  version: number;
  title: string;
  content_md: string;
  created_at: string;
}

export interface TrashItem {
  id: number;
  space_id: number;
  title: string;
  deleted_at: string | null;
  space_name: string;
}

export interface Attachment {
  id: number;
  document_id: number | null;
  uploader_id: number;
  filename: string;
  mime_type: string;
  size: number;
  storage_key: string;
  created_at: string;
}

export interface AclEntryView {
  subject_type: SubjectType;
  subject_id: number | null;
  permission: Permission;
  inherit: number;
  subject_name: string | null;
}

export interface AclEntryInput {
  subject_type: SubjectType;
  subject_id: number | null;
  permission: Permission;
  inherit: number;
}

export interface Group {
  id: number;
  name: string;
  description: string | null;
  external_dn: string | null;
  source: 'local' | 'ldap';
  created_at: string;
}

export interface GroupMember {
  id: number;
  username: string;
  display_name: string;
  email: string | null;
  source: string;
  is_active: number;
}

export interface AdminUserRow {
  id: number;
  username: string;
  display_name: string;
  email: string | null;
  source: 'local' | 'ldap' | 'oidc';
  is_admin: number;
  is_active: number;
  created_at: string;
  last_login_at: string | null;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

/** 搜索结果（search.service SearchHit，snippet 为纯文本） */
export interface SearchHit {
  id: number;
  space_id: number;
  space_name: string;
  title: string;
  snippet: string;
  status: string;
  updated_at: string;
  score: number;
}

export interface SearchOutcome {
  items: SearchHit[];
  total: number;
  page: number;
  limit: number;
  fallback: boolean;
}

export interface SearchSuggest {
  id: number;
  title: string;
  space_name: string;
}

export interface ImportJob {
  id: number;
  job_no: string;
  source_type: 'docx' | 'xlsx' | 'markdown';
  filename: string;
  target_space_id: number | null;
  status: 'pending' | 'running' | 'success' | 'failed';
  total: number;
  processed: number;
  /** 成功时为 JSON 字符串（含 doc_ids），失败时可能为错误文案，均按 unknown 收窄 */
  result: string | null;
  error: string | null;
  created_by: number;
  created_at: string;
  finished_at: string | null;
}

export interface NotificationSubscription {
  id: number;
  user_id: number;
  channel_id: number;
  event_type: string;
  enabled: number;
}

export interface NotificationChannel {
  id: number;
  name: string;
  type: 'wecom' | 'feishu' | 'email';
  config: Record<string, string>;
  enabled: number;
  created_at: string;
}

export interface AuditLogRow {
  id: number;
  user_id: number | null;
  username: string | null;
  action: string;
  object_type: string | null;
  object_id: number | null;
  detail: string | null;
  ip: string | null;
  created_at: string;
}

export interface SitePublicSettings {
  siteName: string;
  defaultLocale: string;
  availableLocales: string[];
  themes: string[];
  loginProviders: LoginProviders;
}
