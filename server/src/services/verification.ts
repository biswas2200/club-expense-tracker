import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { VERIFICATION_OUTCOMES, type EntryDTO, type EntrySource } from '@nocap/shared';
import { askNext, closePing } from '../bot/pingQueue';
import { HttpError, notFound } from '../lib/http';
import { LedgerEntry } from '../models/LedgerEntry';
import { Member, type MemberDoc } from '../models/Member';
import { Verification } from '../models/Verification';
import { describeEntry, recordAudit } from './audit';
import { optionalText, saveProof } from './entries';
import { entryDTO, type StoredEntry } from './ledger';
import { confirmerOf, verificationsFor } from './verificationState';

const verifySchema = z.object({
  outcome: z.enum(VERIFICATION_OUTCOMES, { message: 'Choose confirmed or disputed' }),
  note: optionalText(300),
});

interface VerifyInput {
  entryId: string;
  actor: MemberDoc;
  body: unknown;
  file?: { buffer: Buffer };
  uploadDir: string;
  channel?: EntrySource;
}

/**
 * Records a check of an entry by "the other party":
 * - money from or to a club member: that member (or whoever paid on their behalf) confirms;
 * - anything else: an admin who did not record it checks the proof, attaching a bill to cash
 *   that has none.
 * Nobody verifies their own entry, and only the latest version of an entry can be verified.
 */
export async function verifyEntry({
  entryId,
  actor,
  body,
  file,
  uploadDir,
  channel = 'web',
}: VerifyInput): Promise<EntryDTO> {
  const fields = verifySchema.parse(body);
  const entry = (await LedgerEntry.findById(entryId).lean()) as StoredEntry | null;
  if (!entry) throw notFound('Entry');

  if (await LedgerEntry.exists({ correctsEntryId: entry._id })) {
    throw new HttpError(400, 'Only the latest version of an entry can be verified');
  }
  if (entry.createdBy.equals(actor._id)) {
    throw new HttpError(403, 'You recorded this entry, so someone else has to verify it');
  }
  const checks = (await verificationsFor([entry._id])).get(String(entry._id));
  if (checks?.latest.outcome === 'confirmed') {
    throw new HttpError(409, 'This entry is already verified');
  }

  const confirmerId = confirmerOf(entry);
  let method: 'member' | 'admin';
  if (confirmerId) {
    if (!confirmerId.equals(actor._id)) {
      const confirmer = await Member.findById(confirmerId, { name: 1 }).lean();
      throw new HttpError(
        403,
        `Only ${confirmer?.name ?? 'the member involved'} can confirm or dispute this payment`,
      );
    }
    method = 'member';
  } else {
    if (actor.role !== 'admin') {
      throw new HttpError(403, 'Only an admin who did not record this entry can verify it');
    }
    method = 'admin';
  }

  if (fields.outcome === 'disputed' && !fields.note) {
    throw new HttpError(400, 'Say what is wrong with this entry');
  }
  const hasProof = Boolean(entry.proofPath || checks?.bill);
  if (method === 'admin' && fields.outcome === 'confirmed' && !hasProof && !file) {
    throw new HttpError(400, 'Attach the bill photo or receipt to verify this cash entry');
  }

  const bill = file ? await saveProof(file, uploadDir, 'The bill') : undefined;
  try {
    await Verification.create({
      entryId: entry._id,
      eventId: entry.eventId,
      verifiedBy: actor._id,
      outcome: fields.outcome,
      method,
      note: fields.note,
      proofPath: bill,
      channel,
    });
  } catch (err) {
    if (bill) await unlink(path.join(uploadDir, bill)).catch(() => {});
    throw err;
  }

  const verb =
    fields.outcome === 'disputed' ? 'Disputed' : method === 'admin' ? 'Verified' : 'Confirmed';
  await recordAudit({
    actorId: actor._id,
    action: fields.outcome === 'disputed' ? 'entry.disputed' : 'entry.confirmed',
    eventId: entry.eventId,
    entryId: entry._id,
    summary: `${verb} ${describeEntry(entry)}${channel === 'chat' ? ' via chat' : ''}${fields.note ? `: ${fields.note}` : ''}`,
  });

  // Answered in the app: the bot stops waiting for a reply and asks its next question.
  const waiting = await closePing(entry._id, 'answered');
  if (waiting) await askNext(waiting);
  return entryDTO(entry.eventId, entry._id);
}
