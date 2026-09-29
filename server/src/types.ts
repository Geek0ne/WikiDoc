/** 全局共享类型定义。业务模块一律从这里引用，禁止各自重复声明。 */

import type { Request } from 'express';

/** 权限等级：1 只读 / 2 可写 / 3 可管理 */
export type Permission = 1 | 2 | 3;

/** 主体类型：单个用户 / 用户组 / 所有人 */
export type SubjectType = 'user' | 'group' | 'everyone';

/** ACL 挂载对象类型 */
export type ObjectType = 'space' | 'document';

/** 文档可见性：继承 / 完全公开（免登录可读）/ 空间内可见 / 私有 */
export type Visibility = 'inherit' | 'public' | 'space' | 'private';

/** 权限来源，用于 doc_acl_flat 追溯 */
export type PermissionSource = 'direct' | 'group' | 'space' | 'public' | 'admin';

export interface User {
  id: number;
  username: string;
  display_name: string;
  email: string | null;
  avatar_url: string | null;
  /** 仅本地账号有值，bcrypt 哈希；域/单点账号为 null */
  password_hash: string | null;
  /** 账号来源：local 本地 / ldap 域账号 / oidc 单点 */
  source: 'local' | 'ldap' | 'oidc';
  external_id: string | null;
  is_admin: number;
  is_active: number;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Group {
  id: number;
  name: string;
  description: string | null;
  /** AD 组的 DN，本地组为空 */
  external_dn: string | null;
  source: 'local' | 'ldap';
  created_at: string;
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
  /** 物化路径，形如 /1/12/34/ ，用于权限继承与子树重算 */
  path: string;
  sort_order: number;
  author_id: number;
  updated_by: number | null;
  version: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AclEntry {
  id: number;
  object_type: ObjectType;
  object_id: number;
  subject_type: SubjectType;
  subject_id: number | null;
  permission: Permission;
  inherit: number;
  created_at: string;
}

export interface DocumentVersion {
  id: number;
  document_id: number;
  version: number;
  title: string;
  content_md: string;
  author_id: number;
  change_note: string | null;
  created_at: string;
}

export interface Attachment {
  id: number;
  document_id: number | null;
  uploader_id: number;
  filename: string;
  mime_type: string;
  size: number;
  /** 落盘随机名，不含扩展名，杜绝路径穿越 */
  storage_key: string;
  created_at: string;
}

/** 挂载了用户信息的请求对象，鉴权中间件通过后可用 */
export interface AuthRequest extends Request {
  user?: User;
  /** 用户所属组的 id 列表，登录时解析一次后缓存到请求上 */
  groupIds?: number[];
}

/** 统一响应包装 */
export interface ApiResponse<T = unknown> {
  code: number;
  data: T | null;
  message: string;
}

/** 分页响应 */
export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}
