import type { Types } from 'mongoose';
import { z } from 'zod';
import { formatPaise, MAX_PAISE, type CashCountDTO, type CashDTO } from '@nocap/shared';
import type { EventFields } from '../models/Event';
import { CashCount, type CashCountFields } from '../models/CashCount';
import type { MemberDoc } from '../models/Member';
import { recordAudit } from './audit';
import { optionalText } from './entries';
import { eventDTOs } from './ledger';
import { namesFor, personRef } from './people';

type StoredEvent = EventFields & { _id: Types.ObjectId; createdAt: Date };
type StoredCount = CashCountFields & { _id: Types.ObjectId; createdAt: Date };

const countSchema = z.object({
  countedPaise: z
    .number({ message: 'Enter the cash counted' })
    .int('Cash counted must be a whole number of paise')
    .min(0, 'Cash counted cannot be negative')
    .max(MAX_PAISE, 'Cash counted is too large'),
  note: optionalText(300),
});

function toDTO(c: StoredCount, names: Map<string, string>): CashCountDTO {
  return {
    id: String(c._id),
    eventId: String(c.eventId),
    countedPaise: c.countedPaise,
    expectedPaise: c.expectedPaise,
    differencePaise: c.differencePaise,
    note: c.note ?? undefined,
    countedBy: personRef(names, c.countedBy)!,
    createdAt: c.createdAt.toISOString(),
  };
}

async function expectedCash(event: StoredEvent) {
  const [dto] = await eventDTOs([event]);
  return dto!.summary.cashExpectedPaise;
}

export async function cashSummary(event: StoredEvent): Promise<CashDTO> {
  const counts = (await CashCount.find({ eventId: event._id })
    .sort({ createdAt: -1, _id: -1 })
    .lean()) as StoredCount[];
  const names = await namesFor(counts.map((c) => c.countedBy));
  return { expectedPaise: await expectedCash(event), counts: counts.map((c) => toDTO(c, names)) };
}

/** Records a physical count against what the ledger expects at this moment. */
export async function recordCashCount(event: StoredEvent, actor: MemberDoc, body: unknown) {
  const { countedPaise, note } = countSchema.parse(body);
  const expectedPaise = await expectedCash(event);
  const differencePaise = countedPaise - expectedPaise;
  const count = await CashCount.create({
    eventId: event._id,
    countedBy: actor._id,
    countedPaise,
    expectedPaise,
    differencePaise,
    note,
  });
  const gap =
    differencePaise === 0
      ? 'it matches'
      : `${formatPaise(Math.abs(differencePaise))} ${differencePaise < 0 ? 'short' : 'over'}`;
  await recordAudit({
    actorId: actor._id,
    action: 'cash.counted',
    eventId: event._id,
    summary: `Counted ${formatPaise(countedPaise)} cash in hand; expected ${formatPaise(expectedPaise)}, ${gap}`,
  });
  return toDTO(count.toObject() as StoredCount, await namesFor([actor._id]));
}
