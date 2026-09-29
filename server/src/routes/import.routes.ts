import type { Router } from 'express';
import { Router as createRouter } from 'express';
import { ok } from '../utils/response';
import { h } from '../utils/handler';
import { requireAuth } from '../middleware/auth';
import { uploadImport, withUploadError } from '../utils/upload';
import { createImportJob, getImportJob, listImportJobs } from '../services/import.service';
import type { AuthRequest } from '../types';

/** 导入路由：提交任务后凭 job_no 轮询状态 */
const router: Router = createRouter();
router.use('/import', requireAuth);

router.get(
  '/import/jobs',
  h((req: AuthRequest, res) => {
    ok(res, { items: listImportJobs(req.user!) });
  })
);

router.get(
  '/import/jobs/:jobNo',
  h((req: AuthRequest, res) => {
    ok(res, { job: getImportJob(req.user!, req.params.jobNo) });
  })
);

router.post(
  '/import',
  withUploadError(uploadImport),
  h((req: AuthRequest, res) => {
    const file = req.file as Express.Multer.File | undefined;
    if (!file) {
      ok(res, null, '缺少上传文件');
      return;
    }
    const body = req.body as { target_space_id?: string; parent_id?: string; status?: string };
    const job = createImportJob(
      req.user!,
      req.groupIds ?? [],
      { originalname: file.originalname, size: file.size, buffer: file.buffer },
      {
        target_space_id: Number(body.target_space_id),
        parent_id: body.parent_id ? Number(body.parent_id) : null,
        status: body.status === 'draft' ? 'draft' : 'published',
      }
    );
    ok(res, { job }, '导入任务已提交');
  })
);

export default router;
