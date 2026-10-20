import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createCast, loginAs, useTestApp } from './helpers';

describe('events API', () => {
  const ctx = useTestApp();

  it('requires login', async () => {
    await request(ctx.app).get('/api/events').expect(401);
  });

  it('lets an admin create an event with an empty summary', async () => {
    const { admin } = await createCast();
    const agent = await loginAs(ctx.app, admin._id);
    const res = await agent
      .post('/api/events')
      .send({ name: 'Freshers 2026', budgetPaise: 2_500_000 })
      .expect(201);
    expect(res.body).toMatchObject({
      id: expect.any(String),
      name: 'Freshers 2026',
      budgetPaise: 2_500_000,
      summary: {
        budgetPaise: 2_500_000,
        collectedPaise: 0,
        spentPaise: 0,
        remainingBudgetPaise: 2_500_000,
        balancePaise: 0,
        activeEntryCount: 0,
      },
    });
  });

  it.each(['member', 'viewer'] as const)('forbids a %s from creating events', async (role) => {
    const cast = await createCast();
    const agent = await loginAs(ctx.app, cast[role]._id);
    await agent.post('/api/events').send({ name: 'Nope', budgetPaise: 100 }).expect(403);
  });

  it.each([
    [{ name: '', budgetPaise: 100 }],
    [{ name: 'Fest', budgetPaise: -1 }],
    [{ name: 'Fest', budgetPaise: 10.5 }],
    [{ name: 'Fest' }],
  ])('validates %j', async (body) => {
    const { admin } = await createCast();
    const agent = await loginAs(ctx.app, admin._id);
    const res = await agent.post('/api/events').send(body).expect(400);
    expect(res.body.error).toBeTruthy();
  });

  it('lists events newest first for any logged-in role', async () => {
    const { admin, viewer } = await createCast();
    const adminAgent = await loginAs(ctx.app, admin._id);
    await adminAgent.post('/api/events').send({ name: 'First', budgetPaise: 100 }).expect(201);
    await adminAgent.post('/api/events').send({ name: 'Second', budgetPaise: 200 }).expect(201);

    const viewerAgent = await loginAs(ctx.app, viewer._id);
    const res = await viewerAgent.get('/api/events').expect(200);
    expect(res.body.map((e: { name: string }) => e.name)).toEqual(['Second', 'First']);
  });

  it('gets one event and 404s for unknown or malformed ids', async () => {
    const { admin } = await createCast();
    const agent = await loginAs(ctx.app, admin._id);
    const created = await agent
      .post('/api/events')
      .send({ name: 'Fest', budgetPaise: 500 })
      .expect(201);
    await agent.get(`/api/events/${created.body.id}`).expect(200);
    await agent.get('/api/events/64b7f0f0f0f0f0f0f0f0f0f0').expect(404);
    await agent.get('/api/events/not-an-id').expect(404);
  });
});
