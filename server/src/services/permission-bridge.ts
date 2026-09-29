/**
 * 权限判定桥接层 → 已收敛为对权威实现的转发。
 *
 * 核心模块 services/permission.service.ts 已落地，扩展模块（附件、画板、
 * 多维表格、导入）历史上经此文件间接调用；现直接 re-export，保持既有
 * import 路径不变。新代码请直接 import permission.service。
 */

export {
  canReadDocument,
  canWriteDocument,
  canManageDocument,
  rebuildAcl,
} from './permission.service';
