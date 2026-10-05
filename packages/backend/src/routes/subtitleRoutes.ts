import express from 'express';
import multer from 'multer';
import { JobController } from '../controllers/JobController';
import { requireUser } from '../auth/session';

/** Vercel functions accept request bodies up to 4.5 MB; a feature film's .srt is ~100 KB. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export function createSubtitleRoutes(controller: JobController) {
  const router = express.Router();

  // Mimetypes for .srt are unreliable across OSes, so the file is validated by parsing it.
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  });

  // Checked before multer so anonymous uploads are rejected without reading the file.
  router.post('/jobs', requireUser, upload.single('file'), controller.create);
  router.get('/jobs/:id', requireUser, controller.get);
  router.post('/jobs/:id/translate', requireUser, controller.translate);
  router.patch('/jobs/:id/cues/:position', requireUser, controller.editCue);
  router.post('/jobs/:id/retry', requireUser, controller.retry);
  router.get('/jobs/:id/download', requireUser, controller.download);
  router.get('/memory/stats', controller.stats);

  return router;
}
