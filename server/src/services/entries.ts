import { randomUUID } from 'node:crypto';
import { unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isValidObjectId, mongo, type Types } from 'mongoose';
import { z } from 'zod';
import {
  DIRECTIONS,
  formatPaise,
  MAX_PAISE,
  MODES,
  type EntryDTO,
  type EntrySource,
} from '@nocap/shared';
import { queueVerificationPing } from '../bot/pingQueue';
import { detectProofType } from '../lib/fileType';
import { normaliseTxnId } from '../lib/txnId';
import { assertObjectId, HttpError, notFound } from '../lib/http';
import { Event } from '../models/Event';
import { LedgerEntry } from '../models/LedgerEntry';
import { Member, type MemberDoc } from '../models/Member';
import { describeEntry, recordAudit } from './audit';
import { entryDTO, type StoredEntry } from './ledger';

export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

/** Multipart fields arrive as strings, so numbers and dates are parsed here. */
export const entryFieldsSchema = z.object({
  direction: z.enum(DIRECTIONS, { message: 'Choose money in or money out' }),
  mode: z.enum(MODES, { message: 'Choose UPI or cash' }),
  amountPaise: z
    .string()
    .regex(/^\d+$/, 'Amount must be a whole number of paise')
    .transform(Number)
    .refine((n) => n <= MAX_PAISE, 'Amount is too large'),
  counterparty: z.string().trim().min(1, 'Say who paid or who was paid').max(120),
  occurredAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
    .transform((s) => new Date(`${s}T00:00:00.000Z`))
    .refine((d) => !Number.isNaN(d.getTime()), 'Date is not valid'),
  txnId: optionalText(64).transform((v) => (v ? normaliseTxnId(v) : undefined)),
  note: optionalText(500),
  correctsEntryId: optionalText(24),
  reason: optionalText(300),
  memberId: optionalText(24),
  paidByMemberId: optionalText(24),
});

/**
 * The entry that already holds this UPI transaction ID, if any. Replaced and voided entries
 * don't count, and neither does the entry being corrected (a correction may keep its ID).
 */
export async function findDuplicatePayment(txnId: string, except?: Types.ObjectId) {
  const same = (await LedgerEntry.find({ txnId }).lean()) as StoredEntry[];
  if (same.length === 0) return undefined;
  const replaced = new Set(
    (
      await LedgerEntry.find(
        { correctsEntryId: { $in: same.map((e) => e._id) } },
        { correctsEntryId: 1 },
      ).lean()
    ).map((e) => String(e.correctsEntryId)),
  );
  return same.find(
    (e) => e.amountPaise > 0 && !replaced.has(String(e._id)) && !(except && e._id.equals(except)),
  );
}

/** Members and admins can pay or be paid; the faculty viewer only reads. */
async function findClubMember(id: string | undefined) {
  if (!id) return undefined;
  const refused = new HttpError(400, 'Pick a club member: an admin or a member');
  if (!isValidObjectId(id)) throw refused;
  const member = await Member.findById(id).lean();
  if (!member || member.role === 'viewer') throw refused;
  return member;
}

/** Checks a proof file's bytes and writes it under a random name. Returns the file name. */
export async function saveProof(file: { buffer: Buffer }, uploadDir: string, label = 'Proof') {
  const type = detectProofType(file.buffer);
  if (!type) throw new HttpError(400, `${label} must be a JPG, PNG, WebP or PDF file`);
  const name = `${randomUUID()}.${type.ext}`;
  await writeFile(path.join(uploadDir, name), file.buffer, { flag: 'wx' });
  return name;
}

interface CreateEntryInput {
  eventId: Types.ObjectId;
  body: unknown;
  file?: { buffer: Buffer };
  member: MemberDoc;
  uploadDir: string;
  /** A proof already in the upload folder: a screenshot sent to the bot. */
  savedProof?: string;
  source?: EntrySource;
}

/**
 * Validates and stores a new ledger entry. A correction is just an entry that points at the
 * one it replaces; nothing already stored is ever modified.
 */
export async function createEntry({
  eventId,
  body,
  file,
  member: actor,
  uploadDir,
  savedProof,
  source = 'web',
}: CreateEntryInput): Promise<EntryDTO> {
  const fields = entryFieldsSchema.parse(body);

  if (file && !detectProofType(file.buffer)) {
    throw new HttpError(400, 'Proof must be a JPG, PNG, WebP or PDF file');
  }
  if (fields.paidByMemberId && !fields.memberId) {
    throw new HttpError(400, 'Pick the club member this payment is for');
  }
  const member = await findClubMember(fields.memberId);
  let paidBy = await findClubMember(fields.paidByMemberId);
  if (paidBy && member && paidBy._id.equals(member._id)) paidBy = undefined;

  let target: StoredEntry | null = null;
  if (fields.correctsEntryId) {
    target = (await LedgerEntry.findById(
      assertObjectId(fields.correctsEntryId, 'Entry being corrected'),
    ).lean()) as StoredEntry | null;
    if (!target) throw notFound('Entry being corrected');
    if (!target.eventId.equals(eventId)) {
      throw new HttpError(400, 'That entry belongs to a different event');
    }
    if (!fields.reason) throw new HttpError(400, 'A correction needs a reason');
    if (await LedgerEntry.exists({ correctsEntryId: target._id })) {
      throw new HttpError(
        409,
        'This entry has already been corrected. Correct the latest version instead.',
      );
    }
  } else {
    if (!file && !savedProof && fields.mode === 'upi') {
      throw new HttpError(400, 'A proof is required for UPI: attach the payment screenshot');
    }
    if (fields.amountPaise === 0) throw new HttpError(400, 'Amount must be more than ₹0');
  }

  if (fields.txnId) {
    const duplicate = await findDuplicatePayment(fields.txnId, target?._id);
    if (duplicate) {
      const event = await Event.findById(duplicate.eventId, { name: 1 }).lean();
      throw new HttpError(
        409,
        `This UPI payment (ref ${fields.txnId}) is already recorded: ${describeEntry(duplicate)} in ${event?.name ?? 'another event'}`,
      );
    }
  }

  const savedFile = file ? await saveProof(file, uploadDir) : undefined;
  try {
    const entry = await LedgerEntry.create({
      ...fields,
      counterparty: member ? member.name : fields.counterparty,
      memberId: member?._id,
      paidByMemberId: paidBy?._id,
      eventId,
      proofPath: savedFile ?? savedProof ?? target?.proofPath,
      createdBy: actor._id,
      source,
    });

    let summary = `Recorded ${describeEntry(entry)} by ${entry.mode === 'upi' ? 'UPI' : 'cash'}${source === 'chat' ? ', via chat' : ''}`;
    if (target) {
      summary =
        entry.amountPaise === 0
          ? `Voided ${describeEntry(target)}: ${entry.reason}`
          : `Corrected ${describeEntry(target)} to ${formatPaise(entry.amountPaise)}: ${entry.reason}`;
    }
    await recordAudit({
      actorId: actor._id,
      action: target ? 'entry.corrected' : 'entry.recorded',
      eventId,
      entryId: entry._id,
      summary,
    });
    await queueVerificationPing(entry.toObject() as StoredEntry, target);
    return entryDTO(eventId, entry._id);
  } catch (err) {
    if (savedFile) await unlink(path.join(uploadDir, savedFile)).catch(() => {});
    if (err instanceof mongo.MongoServerError && err.code === 11000) {
      throw new HttpError(
        409,
        'This entry has already been corrected. Correct the latest version instead.',
      );
    }
    throw err;
  }
}
