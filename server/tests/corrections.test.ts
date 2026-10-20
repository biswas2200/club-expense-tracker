import type request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createCast, loginAs, placeholderPng, useTestApp } from './helpers';

const ctx = useTestApp();

async function setup() {
  const cast = await createCast();
  const agent = await loginAs(ctx.app, cast.admin._id);
  const event = await agent
    .post('/api/events')
    .send({ name: 'Freshers', budgetPaise: 1_000_000 })
    .expect(201);
  const eventId = event.body.id as string;
  const original = await entry(agent, eventId, { amountPaise: '120000' }).expect(201);
  return { ...cast, agent, eventId, original: original.body };
}

function entry(
  agent: request.Agent,
  eventId: string,
  fields: Record<string, string>,
  proof: Buffer | null = placeholderPng(),
) {
  const req = agent
    .post(`/api/events/${eventId}/entries`)
    .field('direction', fields.direction ?? 'out')
    .field('mode', fields.mode ?? 'upi')
    .field('amountPaise', fields.amountPaise ?? '120000')
    .field('counterparty', fields.counterparty ?? 'Decor Shop')
    .field('occurredAt', fields.occurredAt ?? '2026-10-14');
  for (const key of ['correctsEntryId', 'reason']) {
    if (fields[key] !== undefined) req.field(key, fields[key]);
  }
  if (proof) req.attach('proof', proof, { filename: 'shot.png', contentType: 'image/png' });
  return req;
}

describe('corrections', () => {
  it('replaces the original in the totals and keeps both in the list', async () => {
    const { agent, eventId, original } = await setup();
    const fix = await entry(agent, eventId, {
      amountPaise: '102000',
      correctsEntryId: original.id,
      reason: 'Typed 1,200 instead of 1,020',
    }).expect(201);
    expect(fix.body).toMatchObject({
      correctsEntryId: original.id,
      reason: 'Typed 1,200 instead of 1,020',
      status: 'active',
    });

    const list = await agent.get(`/api/events/${eventId}/entries`).expect(200);
    const byId = Object.fromEntries(list.body.map((e: { id: string }) => [e.id, e]));
    expect(byId[original.id]).toMatchObject({
      status: 'superseded',
      correctedByEntryId: fix.body.id,
      amountPaise: 120000,
    });

    const event = await agent.get(`/api/events/${eventId}`).expect(200);
    expect(event.body.summary).toMatchObject({ spentPaise: 102000, activeEntryCount: 1 });
  });

  it('keeps the original proof when no new file is attached', async () => {
    const { agent, eventId, original } = await setup();
    const fix = await entry(
      agent,
      eventId,
      { amountPaise: '100000', correctsEntryId: original.id, reason: 'Wrong amount' },
      null,
    ).expect(201);
    expect(fix.body.proofUrl).toBe(original.proofUrl);
  });

  it('needs a reason', async () => {
    const { agent, eventId, original } = await setup();
    const res = await entry(agent, eventId, { correctsEntryId: original.id }).expect(400);
    expect(res.body.error).toMatch(/reason/i);
  });

  it('only corrects the latest version of an entry', async () => {
    const { agent, eventId, original } = await setup();
    await entry(agent, eventId, { correctsEntryId: original.id, reason: 'First fix' }).expect(201);
    const res = await entry(agent, eventId, {
      correctsEntryId: original.id,
      reason: 'Second fix',
    }).expect(409);
    expect(res.body.error).toMatch(/already been corrected/i);
  });

  it('cannot correct an entry from another event', async () => {
    const { agent, original } = await setup();
    const other = await agent
      .post('/api/events')
      .send({ name: 'Fest', budgetPaise: 100 })
      .expect(201);
    await entry(agent, other.body.id, {
      correctsEntryId: original.id,
      reason: 'Wrong event',
    }).expect(400);
  });

  it('404s when the entry being corrected does not exist', async () => {
    const { agent, eventId } = await setup();
    await entry(agent, eventId, {
      correctsEntryId: '64b7f0f0f0f0f0f0f0f0f0f0',
      reason: 'Ghost',
    }).expect(404);
  });

  it('voids an entry with an amount of 0', async () => {
    const { agent, eventId, original } = await setup();
    const fix = await entry(agent, eventId, {
      amountPaise: '0',
      correctsEntryId: original.id,
      reason: 'Entered twice',
    }).expect(201);
    expect(fix.body.isVoid).toBe(true);
    const event = await agent.get(`/api/events/${eventId}`).expect(200);
    expect(event.body.summary).toMatchObject({ spentPaise: 0, activeEntryCount: 0 });
  });

  it('returns the full history of an entry, oldest first, from any version', async () => {
    const { agent, eventId, original } = await setup();
    const second = await entry(agent, eventId, {
      amountPaise: '110000',
      correctsEntryId: original.id,
      reason: 'Fix 1',
    }).expect(201);
    const third = await entry(agent, eventId, {
      amountPaise: '105000',
      correctsEntryId: second.body.id,
      reason: 'Fix 2',
    }).expect(201);

    for (const id of [original.id, second.body.id, third.body.id]) {
      const history = await agent.get(`/api/entries/${id}/history`).expect(200);
      expect(history.body.map((e: { amountPaise: number }) => e.amountPaise)).toEqual([
        120000, 110000, 105000,
      ]);
    }
  });
});
