import { describe, expect, it } from 'vitest';
import { createCast, loginAs, makeEvent, postEntry, useTestApp } from './helpers';

const ctx = useTestApp();

async function setup() {
  const cast = await createCast();
  const admin = await loginAs(ctx.app, cast.admin._id);
  const eventId = await makeEvent(admin);
  const cash = (direction: string, amountPaise: string, extra: Record<string, string> = {}) =>
    postEntry(
      admin,
      eventId,
      { direction, mode: 'cash', amountPaise, counterparty: 'Someone', ...extra },
      null,
    ).expect(201);
  // Cash in ₹1,000; cash out ₹300 and ₹200 (later corrected to ₹150); plus ₹5,000 by UPI.
  await cash('in', '100000');
  await cash('out', '30000');
  const print = await cash('out', '20000');
  await cash('out', '15000', { correctsEntryId: print.body.id, reason: 'Bill says ₹150' });
  await postEntry(admin, eventId, { direction: 'in', amountPaise: '500000' }).expect(201);
  return { cast, admin, eventId };
}

describe('cash in hand', () => {
  it('expects cash in minus cash out, ignoring UPI and replaced entries', async () => {
    const s = await setup();
    const res = await s.admin.get(`/api/events/${s.eventId}/cash`).expect(200);
    expect(res.body).toEqual({ expectedPaise: 55000, counts: [] });
    const event = await s.admin.get(`/api/events/${s.eventId}`).expect(200);
    expect(event.body.summary.cashExpectedPaise).toBe(55000);
  });

  it('records a count with the difference from what was expected', async () => {
    const s = await setup();
    const res = await s.admin
      .post(`/api/events/${s.eventId}/cash-counts`)
      .send({ countedPaise: 50000, note: 'Cash box after the event' })
      .expect(201);
    expect(res.body).toMatchObject({
      countedPaise: 50000,
      expectedPaise: 55000,
      differencePaise: -5000,
      note: 'Cash box after the event',
      countedBy: { name: 'Asha Admin' },
    });

    const cash = await s.admin.get(`/api/events/${s.eventId}/cash`).expect(200);
    expect(cash.body.counts).toHaveLength(1);
    expect(cash.body.counts[0].differencePaise).toBe(-5000);
  });

  it('lists counts newest first', async () => {
    const s = await setup();
    for (const countedPaise of [50000, 55000]) {
      await s.admin.post(`/api/events/${s.eventId}/cash-counts`).send({ countedPaise }).expect(201);
    }
    const cash = await s.admin.get(`/api/events/${s.eventId}/cash`).expect(200);
    expect(cash.body.counts.map((c: { differencePaise: number }) => c.differencePaise)).toEqual([
      0, -5000,
    ]);
  });

  it.each(['member', 'viewer'] as const)('does not let a %s record a count', async (role) => {
    const s = await setup();
    const agent = await loginAs(ctx.app, s.cast[role]._id);
    await agent.post(`/api/events/${s.eventId}/cash-counts`).send({ countedPaise: 1 }).expect(403);
    await agent.get(`/api/events/${s.eventId}/cash`).expect(200);
  });

  it.each([
    [{ countedPaise: -1 }],
    [{ countedPaise: 1.5 }],
    [{}],
    [{ countedPaise: 1, note: 'x'.repeat(301) }],
  ])('validates %j', async (body) => {
    const s = await setup();
    await s.admin.post(`/api/events/${s.eventId}/cash-counts`).send(body).expect(400);
  });
});
