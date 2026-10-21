import type {
  Direction,
  EntryDTO,
  EntryStatus,
  EventDTO,
  EventSummary,
  Mode,
  VerificationState,
} from '@nocap/shared';
import type { Types } from 'mongoose';
import { Event, type EventFields } from '../models/Event';
import { LedgerEntry, type LedgerEntryFields } from '../models/LedgerEntry';
import { namesFor, personRef } from './people';
import {
  confirmerOf,
  stateOf,
  verificationsFor,
  type EntryVerifications,
} from './verificationState';

/** The minimum an entry needs for status and total calculations. */
export interface LedgerRow {
  id: string;
  direction: Direction;
  mode: Mode;
  amountPaise: number;
  correctsEntryId?: string;
  verification: VerificationState;
}

export type StatusInfo = { status: EntryStatus; correctedByEntryId?: string };

/** An entry is superseded once another entry corrects it; everything else is active. */
export function resolveStatuses(
  rows: Pick<LedgerRow, 'id' | 'correctsEntryId'>[],
): Map<string, StatusInfo> {
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

/**
 * Totals over active entries only. A void correction (amount 0) doesn't count as an entry.
 * Expected cash in hand is cash in minus cash out, whether verified or not: the notes moved.
 */
export function computeSummary(budgetPaise: number, rows: LedgerRow[]): EventSummary {
  const statuses = resolveStatuses(rows);
  const s = {
    collectedPaise: 0,
    spentPaise: 0,
    activeEntryCount: 0,
    unverifiedCount: 0,
    unverifiedPaise: 0,
    disputedCount: 0,
    cashExpectedPaise: 0,
  };
  for (const row of rows) {
    if (statuses.get(row.id)?.status !== 'active' || row.amountPaise === 0) continue;
    s.activeEntryCount++;
    const sign = row.direction === 'in' ? 1 : -1;
    if (row.direction === 'in') s.collectedPaise += row.amountPaise;
    else s.spentPaise += row.amountPaise;
    if (row.mode === 'cash') s.cashExpectedPaise += sign * row.amountPaise;
    if (row.verification === 'unverified') {
      s.unverifiedCount++;
      s.unverifiedPaise += row.amountPaise;
    }
    if (row.verification === 'disputed') s.disputedCount++;
  }
  return {
    budgetPaise,
    collectedPaise: s.collectedPaise,
    spentPaise: s.spentPaise,
    remainingBudgetPaise: budgetPaise - s.spentPaise,
    balancePaise: s.collectedPaise - s.spentPaise,
    activeEntryCount: s.activeEntryCount,
    unverifiedCount: s.unverifiedCount,
    unverifiedPaise: s.unverifiedPaise,
    disputedCount: s.disputedCount,
    cashExpectedPaise: s.cashExpectedPaise,
  };
}

export type StoredEntry = LedgerEntryFields & { _id: Types.ObjectId; createdAt: Date };

export function toRow(
  entry: Pick<StoredEntry, '_id' | 'direction' | 'mode' | 'amountPaise' | 'correctsEntryId'>,
  verification: VerificationState,
): LedgerRow {
  return {
    id: String(entry._id),
    direction: entry.direction,
    mode: entry.mode,
    amountPaise: entry.amountPaise,
    correctsEntryId: entry.correctsEntryId ? String(entry.correctsEntryId) : undefined,
    verification,
  };
}

export function toEntryDTO(
  entry: StoredEntry,
  names: Map<string, string>,
  statusInfo: StatusInfo,
  checks: EntryVerifications | undefined,
): EntryDTO {
  const confirmerId = confirmerOf(entry);
  const proofPath = entry.proofPath ?? checks?.bill;
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
    proofUrl: proofPath ? `/api/proofs/${proofPath}` : undefined,
    member: personRef(names, entry.memberId),
    paidBy: personRef(names, entry.paidByMemberId),
    createdBy: personRef(names, entry.createdBy)!,
    createdAt: entry.createdAt.toISOString(),
    correctsEntryId: entry.correctsEntryId ? String(entry.correctsEntryId) : undefined,
    reason: entry.reason ?? undefined,
    isVoid: Boolean(entry.correctsEntryId) && entry.amountPaise === 0,
    ...statusInfo,
    verification: {
      state: stateOf(checks),
      confirmer: personRef(names, confirmerId),
      needsProof: !confirmerId && !proofPath,
      by: checks ? personRef(names, checks.latest.verifiedBy) : undefined,
      at: checks?.latest.createdAt.toISOString(),
      note: checks?.latest.note ?? undefined,
    },
  };
}

/** Loads every entry of an event, newest first, as DTOs with statuses and verifications. */
export async function listEntryDTOs(eventId: Types.ObjectId | string): Promise<EntryDTO[]> {
  const entries = (await LedgerEntry.find({ eventId })
    .sort({ createdAt: -1, _id: -1 })
    .lean()) as StoredEntry[];
  const checks = await verificationsFor(entries.map((e) => e._id));
  const statuses = resolveStatuses(
    entries.map((e) => toRow(e, stateOf(checks.get(String(e._id))))),
  );
  const names = await namesFor([
    ...entries.flatMap((e) => [e.createdBy, e.memberId, e.paidByMemberId]),
    ...[...checks.values()].map((c) => c.latest.verifiedBy),
  ]);
  return entries.map((e) =>
    toEntryDTO(e, names, statuses.get(String(e._id))!, checks.get(String(e._id))),
  );
}

type StoredEvent = EventFields & { _id: Types.ObjectId; createdAt: Date };

/** Builds event DTOs with summaries using one entries query for all events. */
export async function eventDTOs(events: StoredEvent[]): Promise<EventDTO[]> {
  const entries = await LedgerEntry.find(
    { eventId: { $in: events.map((e) => e._id) } },
    { eventId: 1, direction: 1, mode: 1, amountPaise: 1, correctsEntryId: 1 },
  ).lean();
  const checks = await verificationsFor(entries.map((e) => e._id));
  const rowsByEvent = new Map<string, LedgerRow[]>();
  for (const entry of entries) {
    const key = String(entry.eventId);
    const row = toRow(entry, stateOf(checks.get(String(entry._id))));
    rowsByEvent.set(key, [...(rowsByEvent.get(key) ?? []), row]);
  }
  return events.map((e) => ({
    id: String(e._id),
    name: e.name,
    budgetPaise: e.budgetPaise,
    feePaise: e.feePaise ?? 0,
    createdAt: e.createdAt.toISOString(),
    summary: computeSummary(e.budgetPaise, rowsByEvent.get(String(e._id)) ?? []),
  }));
}

export async function listEventDTOs(): Promise<EventDTO[]> {
  const events = await Event.find().sort({ createdAt: -1, _id: -1 }).lean();
  return eventDTOs(events);
}

export async function entryDTO(
  eventId: Types.ObjectId,
  entryId: Types.ObjectId,
): Promise<EntryDTO> {
  const dtos = await listEntryDTOs(eventId);
  return dtos.find((d) => d.id === String(entryId))!;
}
