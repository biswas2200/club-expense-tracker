import type { Types } from 'mongoose';
import {
  FEE_STATES,
  type FeeRow,
  type FeeState,
  type FeesDTO,
  type PersonRef,
} from '@nocap/shared';
import { Member } from '../models/Member';
import { listEntryDTOs } from './ledger';

/**
 * Who has paid the event fee. Admins and members pay; the faculty viewer does not.
 * Only active money-in entries linked to a member count.
 */
export async function eventFees(event: {
  _id: Types.ObjectId;
  feePaise?: number | null;
}): Promise<FeesDTO> {
  const feePaise = event.feePaise ?? 0;
  const counts = Object.fromEntries(FEE_STATES.map((s) => [s, 0])) as Record<FeeState, number>;
  if (feePaise === 0) return { feePaise, counts, rows: [] };

  const payers = await Member.find({ role: { $in: ['admin', 'member'] } }, { name: 1 })
    .sort({ name: 1 })
    .lean();
  const payments = (await listEntryDTOs(event._id)).filter(
    (e) => e.status === 'active' && e.direction === 'in' && e.member && e.amountPaise > 0,
  );

  const rows: FeeRow[] = payers.map((p) => {
    const id = String(p._id);
    const mine = payments.filter((e) => e.member!.id === id);
    const paidPaise = mine.reduce((n, e) => n + e.amountPaise, 0);
    let state: FeeState;
    if (mine.length === 0) state = 'unpaid';
    else if (mine.some((e) => e.verification.state === 'disputed')) state = 'disputed';
    else if (paidPaise < feePaise) state = 'partly';
    else if (mine.every((e) => e.verification.state === 'verified')) state = 'paid';
    else state = 'awaiting';

    const paidBy = new Map<string, PersonRef>();
    for (const e of mine) if (e.paidBy && e.paidBy.id !== id) paidBy.set(e.paidBy.id, e.paidBy);
    counts[state]++;
    return { member: { id, name: p.name }, state, paidPaise, paidBy: [...paidBy.values()] };
  });

  // People who still owe money first; names alphabetical within a state.
  rows.sort((a, b) => FEE_STATES.indexOf(a.state) - FEE_STATES.indexOf(b.state));
  return { feePaise, counts, rows };
}
