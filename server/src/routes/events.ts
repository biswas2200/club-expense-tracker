import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { MAX_PAISE } from '@nocap/shared';
import { assertObjectId, notFound } from '../lib/http';
import { requireAuth, requireRole } from '../middleware/auth';
import { Event } from '../models/Event';
import { createEntry } from '../services/entries';
import { eventDTOs, listEntryDTOs, listEventDTOs } from '../services/ledger';

export const PROOF_MAX_BYTES = 5 * 1024 * 1024;

const newEventSchema = z.object({
  name: z.string().trim().min(1, 'Event name is required').max(100),
  budgetPaise: z
    .number({ message: 'Budget is required' })
    .int('Budget must be a whole number of paise')
    .min(0, 'Budget cannot be negative')
    .max(MAX_PAISE, 'Budget is too large'),
});

async function findEvent(eventId: unknown) {
  const id = typeof eventId === 'string' ? eventId : undefined;
  const event = await Event.findById(assertObjectId(id, 'Event')).lean();
  if (!event) throw notFound('Event');
  return event;
}

export function eventsRouter(opts: { uploadDir: string }) {
  const router = Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: PROOF_MAX_BYTES, files: 1, fields: 20 },
  });

  router.use(requireAuth);

  router.get('/', async (_req, res) => {
    res.json(await listEventDTOs());
  });

  router.post('/', requireRole('admin'), async (req, res) => {
    const body = newEventSchema.parse(req.body);
    const event = await Event.create({ ...body, createdBy: req.member!._id });
    const [dto] = await eventDTOs([event.toObject()]);
    res.status(201).json(dto);
  });

  router.get('/:eventId', async (req, res) => {
    const [dto] = await eventDTOs([await findEvent(req.params.eventId)]);
    res.json(dto);
  });

  router.get('/:eventId/entries', async (req, res) => {
    const event = await findEvent(req.params.eventId);
    res.json(await listEntryDTOs(event._id));
  });

  // Role and event checks run before multer, so a refused request never uploads a file.
  router.post(
    '/:eventId/entries',
    requireRole('admin'),
    async (req, res, next) => {
      res.locals.event = await findEvent(req.params.eventId);
      next();
    },
    upload.single('proof'),
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

  return router;
}
