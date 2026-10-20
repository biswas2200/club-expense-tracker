import { Router } from 'express';
import { assertObjectId, notFound } from '../lib/http';
import { requireAuth } from '../middleware/auth';
import { LedgerEntry } from '../models/LedgerEntry';
import { listEntryDTOs } from '../services/ledger';

/**
 * Read-only routes for single entries. There are deliberately no PUT, PATCH or DELETE
 * routes: changes are made by posting a correction to the event's entries.
 */
export function entriesRouter() {
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

  return router;
}
