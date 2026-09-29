import { db, getOne, getMany, tx } from '../db';
import { AppError } from '../utils/errors';
import type { Permission } from '../types';

/**
 * 权限权威实现。所有"能不能读/写/管"的判定都走这里，扩展模块经 permission-bridge 转发。
 *
 * 判定模型（并集取最大）：
 *   文档自身 ACL ∪ 祖先文档 ACL(inherit=1) ∪ 空间 ACL ∪ 可见性兜底
 * 取所有命中条目的最大 permission。采用并集而非"就近覆盖"，
 * 是为了避免给子文档补一条低权限 ACL 反而意外收回已有权限。
 *
 * 重算策略：全量重建 doc_acl_flat。内网规模（千级文档、百级用户）下
 * 全量重建毫秒级完成，比分片增算简单且不会漏算 group 成员变动。
 */

interface AclEntryRow {
  object_type: 'space' | 'document';
  object_id: number;
  subject_type: 'user' | 'group' | 'everyone';
  subject_id: number | null;
  permission: number;
  inherit: number;
}

interface DocLite {
  id: number;
  space_id: number;
  path: string;
  visibility: string;
}

/** 祖先解析：物化路径 /1/12/34/ → [1, 12, 34]（不含自身） */
function ancestorIds(path: string): number[] {
  return path
    .split('/')
    .filter(Boolean)
    .map((s) => Number(s))
    .filter((n) => Number.isInteger(n));
}

function docOrThrow(docId: number): DocLite {
  const doc = getOne<DocLite>(
    'SELECT id, space_id, path, visibility FROM documents WHERE id = ?',
    [docId]
  );
  if (!doc) throw AppError.notFound('文档不存在');
  return doc;
}

// ---------------------------------------------------------------------------
// 文档权限解析
// ---------------------------------------------------------------------------

/**
 * 解析用户对文档的权限。userId 传 null 表示匿名（仅 public 可见性生效）。
 * 返回 null 表示无任何权限。
 */
export function resolveDocPermission(
  userId: number | null,
  groupIds: number[],
  docId: number
): Permission | null {
  const doc = getOne<DocLite>(
    'SELECT id, space_id, path, visibility FROM documents WHERE id = ?',
    [docId]
  );
  if (!doc) return null;

  const admin = userId === null
    ? 0
    : (getOne<{ is_admin: number }>('SELECT is_admin FROM users WHERE id = ?', [userId])?.is_admin ?? 0);
  if (admin === 1) return 3;

  const ancestors = ancestorIds(doc.path).filter((id) => id !== docId);
  const ancSlots = ancestors.length ? ancestors.map(() => '?').join(',') : '0';
  const grpSlots = groupIds.length ? groupIds.map(() => '?').join(',') : '0';

  const row = getOne<{ p: number | null }>(
    `SELECT MAX(permission) AS p FROM acl_entries
     WHERE ( (object_type = 'document' AND object_id = ?)
          OR (object_type = 'document' AND object_id IN (${ancSlots}) AND inherit = 1)
          OR (object_type = 'space' AND object_id = ?) )
       AND ( subject_type = 'everyone'
          OR (subject_type = 'user' AND subject_id = ?)
          OR (subject_type = 'group' AND subject_id IN (${grpSlots})) )`,
    [docId, ...ancestors, doc.space_id, ...(userId === null ? [-1] : [userId]), ...groupIds]
  );

  const granted = (row?.p ?? 0) as Permission;
  if (granted >= 1) return granted;

  // 可见性兜底：public 免登录可读，space 登录即可读
  if (doc.visibility === 'public') return 1;
  if (doc.visibility === 'space' && userId !== null) return 1;
  return null;
}

export function hasPermission(
  userId: number,
  docId: number,
  need: Permission,
  groupIds: number[] = []
): boolean {
  const p = resolveDocPermission(userId, groupIds, docId);
  return p !== null && p >= need;
}

export function canReadDocument(userId: number, docId: number, groupIds: number[] = []): boolean {
  return hasPermission(userId, docId, 1, groupIds);
}

export function canWriteDocument(userId: number, docId: number, groupIds: number[] = []): boolean {
  return hasPermission(userId, docId, 2, groupIds);
}

export function canManageDocument(userId: number, docId: number, groupIds: number[] = []): boolean {
  return hasPermission(userId, docId, 3, groupIds);
}

// 断言版：路由层用，不满足直接抛业务错误
export function assertCanRead(userId: number, groupIds: number[], docId: number): void {
  const doc = getOne<{ deleted_at: string | null }>(
    'SELECT deleted_at FROM documents WHERE id = ?',
    [docId]
  );
  if (!doc || doc.deleted_at) throw AppError.notFound('文档不存在或已删除');
  if (!hasPermission(userId, docId, 1, groupIds)) throw AppError.forbidden();
}

export function assertCanWrite(userId: number, groupIds: number[], docId: number): void {
  assertCanRead(userId, groupIds, docId);
  if (!hasPermission(userId, docId, 2, groupIds)) {
    throw AppError.forbidden('没有编辑该文档的权限');
  }
}

export function assertCanManage(userId: number, groupIds: number[], docId: number): void {
  assertCanRead(userId, groupIds, docId);
  if (!hasPermission(userId, docId, 3, groupIds)) {
    throw AppError.forbidden('没有管理该文档的权限');
  }
}

// ---------------------------------------------------------------------------
// 空间权限解析
// ---------------------------------------------------------------------------

export function resolveSpacePermission(
  userId: number | null,
  groupIds: number[],
  spaceId: number
): Permission | null {
  const space = getOne<{ owner_id: number; visibility: string }>(
    'SELECT owner_id, visibility FROM spaces WHERE id = ?',
    [spaceId]
  );
  if (!space) return null;

  if (userId !== null) {
    const admin = getOne<{ is_admin: number }>('SELECT is_admin FROM users WHERE id = ?', [userId]);
    if (admin?.is_admin === 1 || space.owner_id === userId) return 3;
  }

  const grpSlots = groupIds.length ? groupIds.map(() => '?').join(',') : '0';
  const row = getOne<{ p: number | null }>(
    `SELECT MAX(permission) AS p FROM acl_entries
     WHERE object_type = 'space' AND object_id = ?
       AND ( subject_type = 'everyone'
          OR (subject_type = 'user' AND subject_id = ?)
          OR (subject_type = 'group' AND subject_id IN (${grpSlots})) )`,
    [spaceId, ...(userId === null ? [-1] : [userId]), ...groupIds]
  );
  const granted = (row?.p ?? 0) as Permission;
  if (granted >= 1) return granted;

  if (space.visibility === 'public' && userId !== null) return 1;
  return null;
}

function hasSpacePermission(
  userId: number,
  spaceId: number,
  need: Permission,
  groupIds: number[]
): boolean {
  const p = resolveSpacePermission(userId, groupIds, spaceId);
  return p !== null && p >= need;
}

export function canWriteSpace(userId: number, spaceId: number, groupIds: number[] = []): boolean {
  return hasSpacePermission(userId, spaceId, 2, groupIds);
}

export function canManageSpace(userId: number, spaceId: number, groupIds: number[] = []): boolean {
  return hasSpacePermission(userId, spaceId, 3, groupIds);
}

export function assertSpaceWrite(userId: number, groupIds: number[], spaceId: number): void {
  if (!hasSpacePermission(userId, spaceId, 2, groupIds)) {
    throw AppError.forbidden('没有该空间的写入权限');
  }
}

export function assertSpaceManage(userId: number, groupIds: number[], spaceId: number): void {
  if (!hasSpacePermission(userId, spaceId, 3, groupIds)) {
    throw AppError.forbidden('没有该空间的管理权限');
  }
}

// ---------------------------------------------------------------------------
// 列表/检索用的权限过滤辅助
// ---------------------------------------------------------------------------

/** 用户在 doc_acl_flat 中的显式授权（不含可见性兜底，检索过滤时自行 UNION public/space） */
export function grantedDocIds(userId: number, groupIds: number[], level: Permission): Set<number> {
  void groupIds; // flat 表已展开组授权，无需再次过滤
  const rows = getMany<{ doc_id: number }>(
    'SELECT doc_id FROM doc_acl_flat WHERE user_id = ? AND permission >= ?',
    [userId, level]
  );
  return new Set(rows.map((r) => r.doc_id));
}

// ---------------------------------------------------------------------------
// doc_acl_flat 全量重建
// ---------------------------------------------------------------------------

interface FlatRow {
  doc_id: number;
  user_id: number;
  permission: number;
  source: 'direct' | 'group' | 'space';
}

let rebuilding = false;

/** 全量重建。groupIds 参数仅为兼容旧签名，实际无差别全量。 */
function recomputeAll(): { documents: number; entries: number; elapsedMs: number } {
  if (rebuilding) return { documents: 0, entries: 0, elapsedMs: 0 };
  rebuilding = true;
  const started = Date.now();
  try {
    const docs = getMany<DocLite>(
      'SELECT id, space_id, path, visibility FROM documents WHERE deleted_at IS NULL'
    );
    const docById = new Map(docs.map((d) => [d.id, d]));

    const userIds = getMany<{ id: number }>('SELECT id FROM users WHERE is_active = 1').map(
      (r) => r.id
    );
    const activeUsers = new Set(userIds);

    // 组 → 活跃成员集合，全表一次载入后复用
    const groupMembers = new Map<number, Set<number>>();
    for (const row of getMany<{ group_id: number; user_id: number }>(
      `SELECT gm.group_id, gm.user_id FROM group_members gm
       JOIN users u ON u.id = gm.user_id AND u.is_active = 1`
    )) {
      let set = groupMembers.get(row.group_id);
      if (!set) groupMembers.set(row.group_id, (set = new Set()));
      set.add(row.user_id);
    }

    const entries = getMany<AclEntryRow>('SELECT * FROM acl_entries');

    // 逐条 ACL 展开为 (docId → userId → max 权限)
    const acc = new Map<number, Map<number, { p: number; src: number }>>();

    const bump = (docId: number, userId: number, p: number, src: number) => {
      let m = acc.get(docId);
      if (!m) acc.set(docId, (m = new Map()));
      const cur = m.get(userId);
      if (!cur || p > cur.p || (p === cur.p && src > cur.src)) m.set(userId, { p, src });
    };

    const spaceDocsCache = new Map<number, number[]>();
    const docsOfSpace = (spaceId: number): number[] => {
      let ids = spaceDocsCache.get(spaceId);
      if (!ids) {
        ids = docs.filter((d) => d.space_id === spaceId).map((d) => d.id);
        spaceDocsCache.set(spaceId, ids);
      }
      return ids;
    };

    for (const e of entries) {
      // 1) 展开目标文档
      let targets: number[];
      if (e.object_type === 'space') {
        targets = docsOfSpace(e.object_id);
      } else {
        const self = docById.get(e.object_id);
        if (!self) continue;
        if (e.inherit === 1) {
          // 自身 + 子树：物化路径前缀匹配（/1/12/ 不会误中 /1/120/）
          const prefix = self.path.endsWith('/') ? self.path : `${self.path}/`;
          targets = docs.filter((d) => d.id === self.id || d.path.startsWith(prefix)).map((d) => d.id);
        } else {
          targets = [self.id];
        }
      }
      if (!targets.length) continue;

      // 2) 展开目标用户
      let subjects: number[];
      if (e.subject_type === 'everyone') {
        subjects = userIds;
      } else if (e.subject_type === 'user') {
        subjects = e.subject_id !== null && activeUsers.has(e.subject_id) ? [e.subject_id] : [];
      } else {
        const members = e.subject_id !== null ? groupMembers.get(e.subject_id) : undefined;
        subjects = members ? [...members] : [];
      }
      if (!subjects.length) continue;

      // 3) 累加取最大；来源并列时 direct > group > space
      const src = e.object_type === 'space' ? 1 : e.subject_type === 'user' ? 3 : 2;
      for (const d of targets) {
        for (const u of subjects) bump(d, u, e.permission, src);
      }
    }

    // 4) 落库
    const rows: FlatRow[] = [];
    for (const [docId, m] of acc) {
      for (const [userId, v] of m) {
        rows.push({
          doc_id: docId,
          user_id: userId,
          permission: v.p,
          source: v.src === 3 ? 'direct' : v.src === 2 ? 'group' : 'space',
        });
      }
    }

    tx(() => {
      db.prepare('DELETE FROM doc_acl_flat').run();
      const ins = db.prepare(
        `INSERT OR REPLACE INTO doc_acl_flat (doc_id, user_id, permission, source, updated_at)
         VALUES (?, ?, ?, ?, datetime('now'))`
      );
      for (const r of rows) ins.run(r.doc_id, r.user_id, r.permission, r.source);
    });

    return { documents: docs.length, entries: rows.length, elapsedMs: Date.now() - started };
  } finally {
    rebuilding = false;
  }
}

/** 对外暴露的重算入口：全量重建（内网规模下各粒度差异可忽略） */
export function rebuildAllAcl(): { documents: number; entries: number; elapsedMs: number } {
  return recomputeAll();
}

export function rebuildAcl(): { documents: number; entries: number; elapsedMs: number } {
  return recomputeAll();
}

/** ACL 条目变更后调用。objectType/objectId 仅为语义提示，实现为全量重建。 */
export function rebuildAclForObject(objectType: 'space' | 'document', objectId: number): void {
  void objectType;
  void objectId;
  recomputeAll();
}

/** 文档子树变化（移动/新建/删除/恢复）后调用 */
export function rebuildAclForSubtree(docId: number): void {
  void docId;
  recomputeAll();
}

/** 空间 ACL 或空间文档结构变化后调用 */
export function rebuildAclForSpace(spaceId: number): void {
  void spaceId;
  recomputeAll();
}

/** 组成员/组本身变化后调用 */
export function rebuildForGroups(): void {
  recomputeAll();
}

/** 用户增删、启停、提权后调用 */
export function rebuildForUsers(): void {
  recomputeAll();
}
