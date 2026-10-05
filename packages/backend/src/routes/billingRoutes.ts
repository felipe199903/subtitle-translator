import express from 'express';
import { BillingController } from '../controllers/BillingController';
import { requireUser } from '../auth/session';

export function createBillingRoutes(controller: BillingController) {
  const router = express.Router();
  router.get('/prices', controller.prices);
  router.post('/checkout', requireUser, controller.checkout);
  router.post('/portal', requireUser, controller.portal);
  return router;
}
