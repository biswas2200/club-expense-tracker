import type { Types } from 'mongoose';
import type { VerificationState } from '@nocap/shared';
import { Verification, type VerificationFields } from '../models/Verification';

export type VerificationRecord = VerificationFields & { _id: Types.ObjectId; createdAt: Date };

export interface EntryVerifications {
  /** The most recent check decides the entry's state. */
  latest: VerificationRecord;
  /** A bill or receipt attached during any check, if the entry had none. */
  bill?: string;
}

export async function verificationsFor(
  entryIds: Types.ObjectId[],
): Promise<Map<string, EntryVerifications>> {
  const docs = (await Verification.find({ entryId: { $in: entryIds } })
    .sort({ createdAt: 1, _id: 1 })
    .lean()) as VerificationRecord[];
  const byEntry = new Map<string, EntryVerifications>();
  for (const doc of docs) {
    const key = String(doc.entryId);
    byEntry.set(key, { latest: doc, bill: doc.proofPath ?? byEntry.get(key)?.bill });
  }
  return byEntry;
}

export function stateOf(v: EntryVerifications | undefined): VerificationState {
  if (!v) return 'unverified';
  return v.latest.outcome === 'confirmed' ? 'verified' : 'disputed';
}

/**
 * Who has to confirm an entry: whoever paid (or was paid). If that person recorded the entry
 * themselves, they cannot confirm their own record, so another admin checks the proof instead.
 */
export function confirmerOf(entry: {
  memberId?: Types.ObjectId | null;
  paidByMemberId?: Types.ObjectId | null;
  createdBy: Types.ObjectId;
}): Types.ObjectId | undefined {
  const id = entry.paidByMemberId ?? entry.memberId;
  return id && !id.equals(entry.createdBy) ? id : undefined;
}
