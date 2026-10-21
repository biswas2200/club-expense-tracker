import { isValidObjectId, type Types } from 'mongoose';
import { formatPaise, type ActivityAction, type ActivityDTO } from '@nocap/shared';
import { notFound } from '../lib/http';
import { AuditEvent } from '../models/AuditEvent';
import { Event } from '../models/Event';
import { namesFor, personRef } from './people';

/** "₹1,200 paid to Decor Shop" / "₹500 received from Chitra" */
export function describeEntry(e: { amountPaise: number; direction: string; counterparty: string }) {
  const way = e.direction === 'in' ? 'received from' : 'paid to';
  return `${formatPaise(e.amountPaise)} ${way} ${e.counterparty}`;
}

export async function recordAudit(input: {
  actorId: Types.ObjectId;
  action: ActivityAction;
  summary: string;
  eventId?: Types.ObjectId;
  entryId?: Types.ObjectId;
}) {
  await AuditEvent.create(input);
}

/** The activity log, newest first, optionally for one event. */
export async function listActivity(eventId?: string, limit = 200): Promise<ActivityDTO[]> {
  const filter: Record<string, unknown> = {};
  if (eventId !== undefined) {
    if (!isValidObjectId(eventId) || !(await Event.exists({ _id: eventId })))
      throw notFound('Event');
    filter.eventId = eventId;
  }
  const rows = await AuditEvent.find(filter).sort({ createdAt: -1, _id: -1 }).limit(limit).lean();
  const names = await namesFor(rows.map((r) => r.actorId));
  const events = await Event.find(
    { _id: { $in: rows.map((r) => r.eventId).filter(Boolean) } },
    { name: 1 },
  ).lean();
  const eventNames = new Map(events.map((e) => [String(e._id), e.name]));
  return rows.map((r) => ({
    id: String(r._id),
    at: r.createdAt.toISOString(),
    actor: personRef(names, r.actorId)!,
    action: r.action,
    summary: r.summary,
    eventId: r.eventId ? String(r.eventId) : undefined,
    eventName: r.eventId ? eventNames.get(String(r.eventId)) : undefined,
    entryId: r.entryId ? String(r.entryId) : undefined,
  }));
}
