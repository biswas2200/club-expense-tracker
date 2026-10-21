import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createCast, loginAs, makeEvent, postEntry, useTestApp, verify } from './helpers';

const ctx = useTestApp();

type Activity = { action: string; actor: { name: string }; summary: string; eventName?: string };

describe('activity log', () => {
  it('records who did what, newest first', async () => {
    const cast = await createCast();
    const admin = await loginAs(ctx.app, cast.admin._id);
    const admin2 = await loginAs(ctx.app, cast.admin2._id);
    const eventId = await makeEvent(admin, { name: 'Freshers 2026', budgetPaise: 2_500_000 });
    const entry = await postEntry(admin, eventId, { amountPaise: '120000' }).expect(201);
    await verify(admin2, entry.body.id, { outcome: 'confirmed' }).expect(201);
    await admin.post(`/api/events/${eventId}/cash-counts`).send({ countedPaise: 0 }).expect(201);

    const res = await admin.get('/api/activity').expect(200);
    const log: Activity[] = res.body;
    expect(log.map((a) => a.action)).toEqual([
      'cash.counted',
      'entry.confirmed',
      'entry.recorded',
      'event.created',
    ]);
    expect(log.map((a) => a.actor.name)).toEqual([
      'Asha Admin',
      'Bala Admin',
      'Asha Admin',
      'Asha Admin',
    ]);
    expect(log[3]!.summary).toMatch(/Created Freshers 2026 with a budget of ₹25,000/);
    expect(log[2]!.summary).toMatch(/Recorded ₹1,200 paid to Decor Shop by UPI/);
    expect(log[1]!.summary).toMatch(/Verified ₹1,200 paid to Decor Shop/);
    expect(log[0]!.summary).toMatch(/Counted ₹0 cash in hand; expected ₹0/);
    expect(log[0]!.eventName).toBe('Freshers 2026');
  });

  it('records corrections and disputes with their reasons', async () => {
    const cast = await createCast();
    const admin = await loginAs(ctx.app, cast.admin._id);
    const member = await loginAs(ctx.app, cast.member._id);
    const eventId = await makeEvent(admin);
    const fee = await postEntry(
      admin,
      eventId,
      { direction: 'in', mode: 'cash', amountPaise: '50000', memberId: String(cast.member._id) },
      null,
    ).expect(201);
    await verify(member, fee.body.id, { outcome: 'disputed', note: 'I paid ₹300' }).expect(201);
    await postEntry(
      admin,
      eventId,
      {
        direction: 'in',
        mode: 'cash',
        amountPaise: '30000',
        memberId: String(cast.member._id),
        correctsEntryId: fee.body.id,
        reason: 'Member paid ₹300',
      },
      null,
    ).expect(201);

    const log: Activity[] = (await admin.get('/api/activity').expect(200)).body;
    expect(log[0]).toMatchObject({ action: 'entry.corrected', actor: { name: 'Asha Admin' } });
    expect(log[0]!.summary).toMatch(
      /Corrected ₹500 received from Chitra Member to ₹300: Member paid ₹300/,
    );
    expect(log[1]).toMatchObject({ action: 'entry.disputed', actor: { name: 'Chitra Member' } });
    expect(log[1]!.summary).toMatch(/Disputed ₹500 received from Chitra Member: I paid ₹300/);
  });

  it('filters by event', async () => {
    const cast = await createCast();
    const admin = await loginAs(ctx.app, cast.admin._id);
    const a = await makeEvent(admin, { name: 'A' });
    await makeEvent(admin, { name: 'B' });
    const log: Activity[] = (await admin.get(`/api/activity?eventId=${a}`).expect(200)).body;
    expect(log).toHaveLength(1);
    expect(log[0]!.eventName).toBe('A');
    await admin.get('/api/activity?eventId=nope').expect(404);
  });

  it('is readable by every role after login', async () => {
    const cast = await createCast();
    const viewer = await loginAs(ctx.app, cast.viewer._id);
    await viewer.get('/api/activity').expect(200);
    await request(ctx.app).get('/api/activity').expect(401);
  });
});
