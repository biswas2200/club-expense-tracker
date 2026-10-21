import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { Member, toMemberDTO } from '../models/Member';

/** Everyone in the club by name, for pickers. Phone numbers are never sent. */
export function membersRouter() {
  const router = Router();
  router.use(requireAuth);
  router.get('/', async (_req, res) => {
    const members = await Member.find().sort({ name: 1 });
    res.json(members.map(toMemberDTO));
  });
  return router;
}
