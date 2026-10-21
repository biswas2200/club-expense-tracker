import { Router } from 'express';
import type { MyPaymentDTO } from '@nocap/shared';
import { requireAuth } from '../middleware/auth';
import { Event } from '../models/Event';
import { LedgerEntry } from '../models/LedgerEntry';
import { listEntryDTOs } from '../services/ledger';

export function meRouter() {
  const router = Router();
  router.use(requireAuth);

  /** Payments I am part of (for me, or paid by me), newest first, and which I can confirm. */
  router.get('/payments', async (req, res) => {
    const me = String(req.member!._id);
    const eventIds = await LedgerEntry.distinct('eventId', {
      $or: [{ memberId: req.member!._id }, { paidByMemberId: req.member!._id }],
    });
    const events = await Event.find({ _id: { $in: eventIds } }, { name: 1 }).lean();
    const rows: MyPaymentDTO[] = [];
    for (const event of events) {
      for (const e of await listEntryDTOs(event._id)) {
        if (e.status !== 'active' || (e.member?.id !== me && e.paidBy?.id !== me)) continue;
        rows.push({
          ...e,
          eventName: event.name,
          canRespond:
            e.verification.confirmer?.id === me &&
            e.verification.state !== 'verified' &&
            e.createdBy.id !== me,
        });
      }
    }
    rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    res.json(rows);
  });

  return router;
}
