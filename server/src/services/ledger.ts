import type { Direction, EntryDTO, EntryStatus, EventDTO, EventSummary } from '@nocap/shared';
import type { Types } from 'mongoose';
import { Event, type EventFields } from '../models/Event';
import { LedgerEntry, type LedgerEntryFields } from '../models/LedgerEntry';

/** The minimum an entry needs for status and total calculations. */
export interface LedgerRow {
  id: string;
  direction: Direction;
  amountPaise: number;
  correctsEntryId?: string;
}

export type StatusInfo = { status: EntryStatus; correctedByEntryId?: string };

/** An entry is superseded once another entry corrects it; everything else is active. */
export function resolveStatuses(rows: LedgerRow[]): Map<string, StatusInfo> {
  const correctedBy = new Map<string, string>();
  for (const row of rows) {
    if (row.correctsEntryId) correctedBy.set(row.correctsEntryId, row.id);
  }
  const statuses = new Map<string, StatusInfo>();
  for (const row of rows) {
    const by = correctedBy.get(row.id);
    statuses.set(
      row.id,
      by ? { status: 'superseded', correctedByEntryId: by } : { status: 'active' },
    );
  }
  return statuses;
}

/** Totals over active entries only. A void correction (amount 0) doesn't count as an entry. */
export function computeSummary(budgetPaise: number, rows: LedgerRow[]): EventSummary {
  const statuses = resolveStatuses(rows);
  let collectedPaise = 0;
  let spentPaise = 0;
  let activeEntryCount = 0;
  for (const row of rows) {
    if (statuses.get(row.id)?.status !== 'active' || row.amountPaise === 0) continue;
    activeEntryCount++;
    if (row.direction === 'in') collectedPaise += row.amountPaise;
    else spentPaise += row.amountPaise;
  }
  return {
    budgetPaise,
    collectedPaise,
    spentPaise,
    remainingBudgetPaise: budgetPaise - spentPaise,
    balancePaise: collectedPaise - spentPaise,
    activeEntryCount,
  };
}

type StoredEntry = LedgerEntryFields & { _id: Types.ObjectId; createdAt: Date };

export function toRow(
  entry: Pick<StoredEntry, '_id' | 'direction' | 'amountPaise' | 'correctsEntryId'>,
): LedgerRow {
  return {
    id: String(entry._id),
    direction: entry.direction,
    amountPaise: entry.amountPaise,
    correctsEntryId: entry.correctsEntryId ? String(entry.correctsEntryId) : undefined,
  };
}

export function toEntryDTO(
  entry: StoredEntry,
  createdBy: { _id: Types.ObjectId; name: string } | null,
  statusInfo: StatusInfo,
): EntryDTO {
  return {
    id: String(entry._id),
    eventId: String(entry.eventId),
    direction: entry.direction,
    mode: entry.mode,
    amountPaise: entry.amountPaise,
    counterparty: entry.counterparty,
    occurredAt: entry.occurredAt.toISOString(),
    txnId: entry.txnId ?? undefined,
    note: entry.note ?? undefined,
    proofUrl: `/api/proofs/${entry.proofPath}`,
    createdBy: { id: createdBy ? String(createdBy._id) : '', name: createdBy?.name ?? 'Unknown' },
    createdAt: entry.createdAt.toISOString(),
    correctsEntryId: entry.correctsEntryId ? String(entry.correctsEntryId) : undefined,
    reason: entry.reason ?? undefined,
    isVoid: Boolean(entry.correctsEntryId) && entry.amountPaise === 0,
    ...statusInfo,
  };
}

/** Loads every entry of an event, newest first, as DTOs with their statuses. */
export async function listEntryDTOs(eventId: Types.ObjectId | string): Promise<EntryDTO[]> {
  const entries = await LedgerEntry.find({ eventId })
    .sort({ createdAt: -1, _id: -1 })
    .populate<{ createdBy: { _id: Types.ObjectId; name: string } | null }>('createdBy', 'name')
    .lean();
  const statuses = resolveStatuses(entries.map(toRow));
  return entries.map((e) =>
    toEntryDTO(
      { ...e, createdBy: e.createdBy?._id } as StoredEntry,
      e.createdBy,
      statuses.get(String(e._id))!,
    ),
  );
}

type StoredEvent = EventFields & { _id: Types.ObjectId; createdAt: Date };

function toEventDTO(event: StoredEvent, rows: LedgerRow[]): EventDTO {
  return {
    id: String(event._id),
    name: event.name,
    budgetPaise: event.budgetPaise,
    createdAt: event.createdAt.toISOString(),
    summary: computeSummary(event.budgetPaise, rows),
  };
}

/** Builds event DTOs with summaries using one entries query for all events. */
export async function eventDTOs(events: StoredEvent[]): Promise<EventDTO[]> {
  const entries = await LedgerEntry.find(
    { eventId: { $in: events.map((e) => e._id) } },
    { eventId: 1, direction: 1, amountPaise: 1, correctsEntryId: 1 },
  ).lean();
  const rowsByEvent = new Map<string, LedgerRow[]>();
  for (const entry of entries) {
    const key = String(entry.eventId);
    rowsByEvent.set(key, [...(rowsByEvent.get(key) ?? []), toRow(entry)]);
  }
  return events.map((e) => toEventDTO(e, rowsByEvent.get(String(e._id)) ?? []));
}

export async function listEventDTOs(): Promise<EventDTO[]> {
  const events = await Event.find().sort({ createdAt: -1, _id: -1 }).lean();
  return eventDTOs(events);
}
