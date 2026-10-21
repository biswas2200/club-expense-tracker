import { Router } from 'express';
import { assertObjectId, notFound } from '../lib/http';
import { proofUpload } from '../lib/uploads';
import { requireAuth, requireRole } from '../middleware/auth';
import { Event } from '../models/Event';
import { cashSummary, recordCashCount } from '../services/cash';
import { createEntry } from '../services/entries';
import { createEvent } from '../services/events';
import { eventFees } from '../services/fees';
import { eventDTOs, listEntryDTOs, listEventDTOs } from '../services/ledger';

async function findEvent(eventId: unknown) {
  const id = typeof eventId === 'string' ? eventId : undefined;
  const event = await Event.findById(assertObjectId(id, 'Event')).lean();
  if (!event) throw notFound('Event');
  return event;
}

export function eventsRouter(opts: { uploadDir: string }) {
  const router = Router();
  router.use(requireAuth);

  router.get('/', async (_req, res) => {
    res.json(await listEventDTOs());
  });

  router.post('/', requireRole('admin'), async (req, res) => {
    res.status(201).json(await createEvent(req.member!, req.body));
  });

  router.get('/:eventId', async (req, res) => {
    const [dto] = await eventDTOs([await findEvent(req.params.eventId)]);
    res.json(dto);
  });

  router.get('/:eventId/entries', async (req, res) => {
    const event = await findEvent(req.params.eventId);
    res.json(await listEntryDTOs(event._id));
  });

  // Role and event checks run before the upload is read, so a refused request never writes a file.
  router.post(
    '/:eventId/entries',
    requireRole('admin'),
    async (req, res, next) => {
      res.locals.event = await findEvent(req.params.eventId);
      next();
    },
    proofUpload(),
    async (req, res) => {
      const entry = await createEntry({
        eventId: res.locals.event._id,
        body: req.body,
        file: req.file,
        member: req.member!,
        uploadDir: opts.uploadDir,
      });
      res.status(201).json(entry);
    },
  );

  router.get('/:eventId/fees', async (req, res) => {
    res.json(await eventFees(await findEvent(req.params.eventId)));
  });

  router.get('/:eventId/cash', async (req, res) => {
    res.json(await cashSummary(await findEvent(req.params.eventId)));
  });

  router.post('/:eventId/cash-counts', requireRole('admin'), async (req, res) => {
    const event = await findEvent(req.params.eventId);
    res.status(201).json(await recordCashCount(event, req.member!, req.body));
  });

  return router;
}
