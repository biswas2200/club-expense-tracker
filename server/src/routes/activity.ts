import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { listActivity } from '../services/audit';

/** The activity log is open to every logged-in member: transparency is the point. */
export function activityRouter() {
  const router = Router();
  router.use(requireAuth);
  router.get('/', async (req, res) => {
    const eventId = typeof req.query.eventId === 'string' ? req.query.eventId : undefined;
    res.json(await listActivity(eventId));
  });
  return router;
}
