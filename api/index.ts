// Vercel Function: serves every /api/* request (see the rewrites in vercel.json).
import { createApp } from '../packages/backend/src/app';

export default createApp();
