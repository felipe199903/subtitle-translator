import express from 'express';
import { AuthController } from '../controllers/AuthController';
import { requireUser } from '../auth/session';

export function createAuthRoutes(controller: AuthController) {
  const router = express.Router();
  router.get('/config', controller.config);
  router.get('/me', controller.me);
  router.post('/google', controller.google);
  router.post('/magic-link', controller.magicLink);
  router.post('/verify', controller.verify);
  router.post('/logout', controller.logout);
  router.delete('/account', requireUser, controller.deleteAccount);
  return router;
}
