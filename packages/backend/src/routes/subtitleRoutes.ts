import express from 'express';
import multer from 'multer';
import { JobController } from '../controllers/JobController';

/** Vercel functions accept request bodies up to 4.5 MB; a feature film's .srt is ~100 KB. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export function createSubtitleRoutes(controller: JobController) {
  const router = express.Router();

  // Mimetypes for .srt are unreliable across OSes, so the file is validated by parsing it.
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  });

  router.post('/jobs', upload.single('file'), controller.create);
  router.get('/jobs/:id', controller.get);
  router.post('/jobs/:id/translate', controller.translate);
  router.patch('/jobs/:id/cues/:position', controller.editCue);
  router.post('/jobs/:id/retry', controller.retry);
  router.get('/jobs/:id/download', controller.download);
  router.get('/memory/stats', controller.stats);

  return router;
}
