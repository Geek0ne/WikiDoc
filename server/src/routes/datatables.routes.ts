import type { Router } from 'express';
import { Router as createRouter } from 'express';
import { ok } from '../utils/response';
import { h } from '../utils/handler';
import { requireAuth } from '../middleware/auth';
import {
  createDataTable,
  getDataTable,
  listDataTables,
  updateDataTable,
  deleteDataTable,
  listRows,
  addRow,
  updateRow,
  deleteRow,
  type DataTableColumn,
} from '../services/datatable.service';
import type { AuthRequest } from '../types';

/** 多维表格路由：列结构与行数据均以 JSON 存取 */
const router: Router = createRouter();
router.use('/datatables', requireAuth);

router.post(
  '/datatables',
  h((req: AuthRequest, res) => {
    const body = req.body as { document_id?: number | null; name?: string; columns?: DataTableColumn[] };
    const table = createDataTable(req.user!, req.groupIds ?? [], body);
    ok(res, { table }, '表格已创建');
  })
);

router.get(
  '/datatables',
  h((req: AuthRequest, res) => {
    const documentId = Number((req.query as { document_id?: string }).document_id);
    ok(res, { items: Number.isInteger(documentId) ? listDataTables(req.user!, req.groupIds ?? [], documentId) : [] });
  })
);

router.get(
  '/datatables/:id',
  h((req: AuthRequest, res) => {
    ok(res, { table: getDataTable(req.user!, req.groupIds ?? [], Number(req.params.id)) });
  })
);

router.put(
  '/datatables/:id',
  h((req: AuthRequest, res) => {
    const body = req.body as { name?: string; columns?: DataTableColumn[] };
    const table = updateDataTable(req.user!, req.groupIds ?? [], Number(req.params.id), body);
    ok(res, { table }, '表格已更新');
  })
);

router.delete(
  '/datatables/:id',
  h((req: AuthRequest, res) => {
    deleteDataTable(req.user!, req.groupIds ?? [], Number(req.params.id));
    ok(res, null, '表格已删除');
  })
);

router.get(
  '/datatables/:id/rows',
  h((req: AuthRequest, res) => {
    ok(res, { items: listRows(req.user!, req.groupIds ?? [], Number(req.params.id)) });
  })
);

router.post(
  '/datatables/:id/rows',
  h((req: AuthRequest, res) => {
    const body = req.body as { cells?: Record<string, unknown>; after_id?: number };
    const row = addRow(req.user!, req.groupIds ?? [], Number(req.params.id), body.cells ?? {}, body.after_id);
    ok(res, { row }, '行已添加');
  })
);

router.put(
  '/datatables/:id/rows/:rowId',
  h((req: AuthRequest, res) => {
    const body = req.body as { cells?: Record<string, unknown> };
    const row = updateRow(req.user!, req.groupIds ?? [], Number(req.params.id), Number(req.params.rowId), body.cells ?? {});
    ok(res, { row }, '行已更新');
  })
);

router.delete(
  '/datatables/:id/rows/:rowId',
  h((req: AuthRequest, res) => {
    deleteRow(req.user!, req.groupIds ?? [], Number(req.params.id), Number(req.params.rowId));
    ok(res, null, '行已删除');
  })
);

export default router;
