import type { Router } from 'express';
import { Router as createRouter } from 'express';
import { ok } from '../utils/response';
import { h } from '../utils/handler';
import { requireAuth } from '../middleware/auth';
import { uploadSingle, withUploadError } from '../utils/upload';
import {
  createAttachment,
  listAttachments,
  readAttachment,
  deleteAttachment,
} from '../services/attachment.service';
import type { AuthRequest } from '../types';

/** 附件路由。下载走 /raw，Content-Disposition 用原始文件名 */
const router: Router = createRouter();
router.use('/attachments', requireAuth);

router.post(
  '/attachments',
  withUploadError(uploadSingle),
  h((req: AuthRequest, res) => {
    const file = req.file as Express.Multer.File | undefined;
    if (!file) {
      ok(res, null, '缺少上传文件');
      return;
    }
    const documentId = (req.body as { document_id?: string }).document_id;
    const att = createAttachment(
      req.user!,
      req.groupIds ?? [],
      {
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        buffer: file.buffer,
      },
      documentId ? Number(documentId) : null
    );
    ok(res, { attachment: att }, '附件已上传');
  })
);

router.get(
  '/attachments',
  h((req: AuthRequest, res) => {
    const documentId = Number((req.query as { document_id?: string }).document_id);
    if (!Number.isInteger(documentId)) {
      ok(res, { items: [] });
      return;
    }
    ok(res, { items: listAttachments(documentId) });
  })
);

router.get(
  '/attachments/:id/raw',
  h((req: AuthRequest, res) => {
    const { attachment, content } = readAttachment(req.user!, req.groupIds ?? [], Number(req.params.id));
    const inline = (attachment.mime_type || '').startsWith('image/');
    res.setHeader('Content-Type', attachment.mime_type || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`
    );
    res.send(content);
  })
);

router.delete(
  '/attachments/:id',
  h((req: AuthRequest, res) => {
    deleteAttachment(req.user!, req.groupIds ?? [], Number(req.params.id));
    ok(res, null, '附件已删除');
  })
);

export default router;
