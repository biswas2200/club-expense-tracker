import { z } from 'zod';
import { formatPaise, MAX_PAISE, type EventDTO } from '@nocap/shared';
import { Event } from '../models/Event';
import type { MemberDoc } from '../models/Member';
import { recordAudit } from './audit';
import { eventDTOs } from './ledger';

const paise = (label: string) =>
  z
    .number({ message: `${label} is required` })
    .int(`${label} must be a whole number of paise`)
    .min(0, `${label} cannot be negative`)
    .max(MAX_PAISE, `${label} is too large`);

const newEventSchema = z.object({
  name: z.string().trim().min(1, 'Event name is required').max(100),
  budgetPaise: paise('Budget'),
  feePaise: paise('Fee').optional().default(0),
});

export async function createEvent(actor: MemberDoc, body: unknown): Promise<EventDTO> {
  const fields = newEventSchema.parse(body);
  const event = await Event.create({ ...fields, createdBy: actor._id });
  const fee = fields.feePaise ? ` and a fee of ${formatPaise(fields.feePaise)} per member` : '';
  await recordAudit({
    actorId: actor._id,
    action: 'event.created',
    eventId: event._id,
    summary: `Created ${event.name} with a budget of ${formatPaise(event.budgetPaise)}${fee}`,
  });
  const [dto] = await eventDTOs([event.toObject()]);
  return dto!;
}
