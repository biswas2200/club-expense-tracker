import { Router } from 'express';
import { assertObjectId, notFound } from '../lib/http';
import { proofUpload } from '../lib/uploads';
import { requireAuth } from '../middleware/auth';
import { LedgerEntry } from '../models/LedgerEntry';
import { listEntryDTOs } from '../services/ledger';
import { verifyEntry } from '../services/verification';

/**
 * Routes for single entries. There are deliberately no PUT, PATCH or DELETE routes: changes
 * are made by posting a correction, and checks by posting a verification.
 */
export function entriesRouter(opts: { uploadDir: string }) {
  const router = Router();
  router.use(requireAuth);

  /** Every version of an entry, oldest first, starting from any version in the chain. */
  router.get('/:entryId/history', async (req, res) => {
    const entry = await LedgerEntry.findById(assertObjectId(req.params.entryId, 'Entry')).lean();
    if (!entry) throw notFound('Entry');

    const byId = new Map((await listEntryDTOs(entry.eventId)).map((e) => [e.id, e]));
    let root = byId.get(String(entry._id))!;
    while (root.correctsEntryId && byId.has(root.correctsEntryId))
      root = byId.get(root.correctsEntryId)!;

    const chain = [root];
    for (
      let next = root.correctedByEntryId;
      next && byId.has(next);
      next = byId.get(next)!.correctedByEntryId
    ) {
      chain.push(byId.get(next)!);
    }
    res.json(chain);
  });

  /** Confirm or dispute an entry; an admin may attach the bill for cash that has none. */
  router.post(
    '/:entryId/verifications',
    async (req, res, next) => {
      const id = typeof req.params.entryId === 'string' ? req.params.entryId : undefined;
      const entry = await LedgerEntry.exists({ _id: assertObjectId(id, 'Entry') });
      if (!entry) throw notFound('Entry');
      next();
    },
    proofUpload(),
    async (req, res) => {
      const dto = await verifyEntry({
        entryId: req.params.entryId as string,
        actor: req.member!,
        body: req.body,
        file: req.file,
        uploadDir: opts.uploadDir,
      });
      res.status(201).json(dto);
    },
  );

  return router;
}
