import { randomUUID } from 'node:crypto';
import { unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { mongo, type Types } from 'mongoose';
import { z } from 'zod';
import { DIRECTIONS, MAX_PAISE, MODES, type EntryDTO } from '@nocap/shared';
import { detectProofType } from '../lib/fileType';
import { assertObjectId, HttpError, notFound } from '../lib/http';
import type { MemberDoc } from '../models/Member';
import { LedgerEntry } from '../models/LedgerEntry';
import { listEntryDTOs } from './ledger';

const optionalText = (max: number) =>
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
  txnId: optionalText(64),
  note: optionalText(500),
  correctsEntryId: optionalText(24),
  reason: optionalText(300),
});

interface CreateEntryInput {
  eventId: Types.ObjectId;
  body: unknown;
  file?: { buffer: Buffer };
  member: MemberDoc;
  uploadDir: string;
}

/**
 * Validates and stores a new ledger entry. A correction is just an entry that points at the
 * one it replaces; nothing already stored is ever modified.
 */
export async function createEntry({
  eventId,
  body,
  file,
  member,
  uploadDir,
}: CreateEntryInput): Promise<EntryDTO> {
  const fields = entryFieldsSchema.parse(body);

  const proofType = file ? detectProofType(file.buffer) : null;
  if (file && !proofType) {
    throw new HttpError(400, 'Proof must be a JPG, PNG, WebP or PDF file');
  }

  let inheritedProof: string | undefined;
  if (fields.correctsEntryId) {
    const target = await LedgerEntry.findById(
      assertObjectId(fields.correctsEntryId, 'Entry being corrected'),
    ).lean();
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
    inheritedProof = target.proofPath;
  } else {
    if (!file) {
      throw new HttpError(
        400,
        'A proof is required: attach the UPI screenshot, bill photo or receipt',
      );
    }
    if (fields.amountPaise === 0) throw new HttpError(400, 'Amount must be more than ₹0');
  }

  let savedFile: string | undefined;
  if (file && proofType) {
    savedFile = `${randomUUID()}.${proofType.ext}`;
    await writeFile(path.join(uploadDir, savedFile), file.buffer, { flag: 'wx' });
  }

  try {
    const entry = await LedgerEntry.create({
      ...fields,
      eventId,
      proofPath: savedFile ?? inheritedProof,
      createdBy: member._id,
    });
    const dtos = await listEntryDTOs(eventId);
    return dtos.find((d) => d.id === String(entry._id))!;
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
