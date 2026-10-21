/**
 * Verification pings: when money is recorded for a member, the bot asks them "is this right?"
 * in their private chat. One question at a time per person; the rest wait in a queue.
 * Answers are handled by the engine; this module only queues, asks and closes.
 */
import type { Types } from 'mongoose';
import { BotPing } from '../models/BotPing';
import { Event } from '../models/Event';
import { LedgerEntry } from '../models/LedgerEntry';
import type { StoredEntry } from '../services/ledger';
import { namesFor } from '../services/people';
import { confirmerOf, stateOf, verificationsFor } from '../services/verificationState';
import { privateChatId, say } from './chats';
import { pingText } from './replies';

const isDuplicateKey = (err: unknown) => (err as { code?: number })?.code === 11000;

/** Closes the ping about an entry. Returns the member if their open question was closed. */
export async function closePing(
  entryId: Types.ObjectId,
  status: 'answered' | 'dropped',
): Promise<Types.ObjectId | undefined> {
  const ping = await BotPing.findOneAndUpdate(
    { entryId, status: { $in: ['queued', 'asked', 'awaiting-note'] } },
    { $set: { status, answeredAt: new Date() }, $unset: { open: 1 } },
  ).lean();
  return ping?.open ? ping.memberId : undefined;
}

/** Called for every new entry: queues a ping for whoever has to confirm it. */
export async function queueVerificationPing(entry: StoredEntry, replaced?: StoredEntry | null) {
  const askAgain = new Set<string>();
  if (replaced) {
    const member = await closePing(replaced._id, 'dropped');
    if (member) askAgain.add(String(member));
  }
  const confirmerId = confirmerOf(entry);
  if (confirmerId && entry.amountPaise > 0) {
    await BotPing.create({ entryId: entry._id, memberId: confirmerId, status: 'queued' });
    askAgain.add(String(confirmerId));
  }
  for (const memberId of askAgain) await askNext(memberId);
}

/** An entry still needs the member's answer if it is the latest version and not verified. */
async function stillNeedsAnswer(entryId: Types.ObjectId) {
  if (await LedgerEntry.exists({ correctsEntryId: entryId })) return false;
  const checks = await verificationsFor([entryId]);
  return stateOf(checks.get(String(entryId))) !== 'verified';
}

/** Sends the member's oldest queued question, unless one is already open. */
export async function askNext(memberId: Types.ObjectId | string) {
  for (;;) {
    if (await BotPing.exists({ memberId, open: true })) return;
    const next = await BotPing.findOne({ memberId, status: 'queued' })
      .sort({ createdAt: 1, _id: 1 })
      .lean();
    if (!next) return;
    if (!(await stillNeedsAnswer(next.entryId))) {
      await BotPing.updateOne({ _id: next._id, status: 'queued' }, { status: 'dropped' });
      continue;
    }

    let claimed;
    try {
      // The unique index on open pings means two requests can't both open a question.
      claimed = await BotPing.findOneAndUpdate(
        { _id: next._id, status: 'queued' },
        { status: 'asked', open: true, askedAt: new Date() },
      );
    } catch (err) {
      if (isDuplicateKey(err)) return;
      throw err;
    }
    if (!claimed) continue;

    const entry = (await LedgerEntry.findById(next.entryId).lean()) as StoredEntry;
    const event = await Event.findById(entry.eventId, { name: 1 }).lean();
    const names = await namesFor([entry.createdBy, entry.memberId, memberId]);
    const forOther =
      entry.paidByMemberId && entry.memberId && !entry.memberId.equals(entry.paidByMemberId);
    await say(
      privateChatId(memberId),
      pingText({
        confirmerName: names.get(String(memberId)) ?? '',
        recordedBy: names.get(String(entry.createdBy)) ?? 'An admin',
        amountPaise: entry.amountPaise,
        direction: entry.direction,
        mode: entry.mode,
        forName: forOther ? names.get(String(entry.memberId)) : undefined,
        eventName: event?.name ?? 'an event',
        occurredAt: entry.occurredAt,
      }),
    );
    return;
  }
}

/** The question a member has open, if any. */
export const openPingOf = (memberId: Types.ObjectId) =>
  BotPing.findOne({ memberId, open: true }).lean();
