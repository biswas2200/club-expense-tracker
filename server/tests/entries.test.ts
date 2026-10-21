import request from 'supertest';
import { describe, expect, it } from 'vitest';
import {
  createCast,
  loginAs,
  makeEvent,
  placeholderPng,
  postEntry as post,
  useTestApp,
} from './helpers';

const ctx = useTestApp();

async function setup() {
  const cast = await createCast();
  const admin = await loginAs(ctx.app, cast.admin._id);
  const event = await admin
    .post('/api/events')
    .send({ name: 'Freshers', budgetPaise: 1_000_000 })
    .expect(201);
  return { ...cast, adminAgent: admin, eventId: event.body.id as string };
}

function postEntry(
  agent: request.Agent,
  eventId: string,
  fields: Record<string, string> = {},
  proof: Buffer | null = placeholderPng(),
) {
  const req = agent
    .post(`/api/events/${eventId}/entries`)
    .field('direction', fields.direction ?? 'out')
    .field('mode', fields.mode ?? 'upi')
    .field('amountPaise', fields.amountPaise ?? '120000')
    .field('counterparty', fields.counterparty ?? 'Decor Shop')
    .field('occurredAt', fields.occurredAt ?? '2026-10-14');
  for (const key of ['txnId', 'note', 'correctsEntryId', 'reason']) {
    if (fields[key] !== undefined) req.field(key, fields[key]);
  }
  if (proof)
    req.attach('proof', proof, {
      filename: fields.filename ?? 'shot.png',
      contentType: fields.contentType ?? 'image/png',
    });
  return req;
}

describe('creating entries', () => {
  it('saves an entry with its proof and shows it in the list and summary', async () => {
    const { adminAgent, eventId } = await setup();
    const res = await postEntry(adminAgent, eventId, {
      txnId: '4321 8765 0001',
      note: 'Balloons',
    }).expect(201);
    expect(res.body).toMatchObject({
      direction: 'out',
      mode: 'upi',
      amountPaise: 120000,
      counterparty: 'Decor Shop',
      txnId: '432187650001', // stored without spaces so duplicates can be found
      note: 'Balloons',
      status: 'active',
      isVoid: false,
      createdBy: { name: 'Asha Admin' },
      proofUrl: expect.stringMatching(/^\/api\/proofs\/[\w-]+\.png$/),
    });
    expect(res.body.occurredAt).toMatch(/^2026-10-14/);

    const list = await adminAgent.get(`/api/events/${eventId}/entries`).expect(200);
    expect(list.body).toHaveLength(1);

    const event = await adminAgent.get(`/api/events/${eventId}`).expect(200);
    expect(event.body.summary).toMatchObject({
      spentPaise: 120000,
      remainingBudgetPaise: 880000,
      balancePaise: -120000,
    });
  });

  it('records money collected', async () => {
    const { adminAgent, eventId } = await setup();
    await postEntry(adminAgent, eventId, {
      direction: 'in',
      mode: 'cash',
      amountPaise: '50000',
      counterparty: 'Chitra Member',
    }).expect(201);
    const event = await adminAgent.get(`/api/events/${eventId}`).expect(200);
    expect(event.body.summary).toMatchObject({ collectedPaise: 50000, balancePaise: 50000 });
  });

  it('rejects an entry without proof', async () => {
    const { adminAgent, eventId } = await setup();
    const res = await postEntry(adminAgent, eventId, {}, null).expect(400);
    expect(res.body.error).toMatch(/proof/i);
  });

  it.each(['member', 'viewer'] as const)('forbids a %s from adding entries', async (role) => {
    const cast = await setup();
    const agent = await loginAs(ctx.app, cast[role]._id);
    await postEntry(agent, cast.eventId).expect(403);
  });

  it.each([
    [{ amountPaise: '0' }],
    [{ amountPaise: '-100' }],
    [{ amountPaise: '12.5' }],
    [{ amountPaise: 'lots' }],
    [{ direction: 'sideways' }],
    [{ mode: 'cheque' }],
    [{ counterparty: '   ' }],
    [{ occurredAt: 'yesterday' }],
  ])('validates %j', async (fields) => {
    const { adminAgent, eventId } = await setup();
    const res = await postEntry(adminAgent, eventId, fields).expect(400);
    expect(res.body.error).toBeTruthy();
  });

  it('rejects a file that is not really an image or PDF', async () => {
    const { adminAgent, eventId } = await setup();
    const fake = Buffer.from('<script>alert(1)</script>');
    const res = await postEntry(adminAgent, eventId, {}, fake).expect(400);
    expect(res.body.error).toMatch(/proof/i);
  });

  it('rejects a proof larger than 5 MB', async () => {
    const { adminAgent, eventId } = await setup();
    const big = Buffer.concat([placeholderPng(), Buffer.alloc(5 * 1024 * 1024)]);
    await postEntry(adminAgent, eventId, {}, big).expect(413);
  });

  it('404s for an unknown event', async () => {
    const { adminAgent } = await setup();
    await postEntry(adminAgent, '64b7f0f0f0f0f0f0f0f0f0f0').expect(404);
  });
});

describe('entries cannot be edited or deleted through the API', () => {
  it.each(['put', 'patch', 'delete'] as const)('has no %s route', async (method) => {
    const { adminAgent, eventId } = await setup();
    const created = await postEntry(adminAgent, eventId).expect(201);
    await adminAgent[method](`/api/entries/${created.body.id}`)
      .send({ amountPaise: 1 })
      .expect(404);
    await adminAgent[method](`/api/events/${eventId}/entries/${created.body.id}`)
      .send({ amountPaise: 1 })
      .expect(404);
    const list = await adminAgent.get(`/api/events/${eventId}/entries`).expect(200);
    expect(list.body[0].amountPaise).toBe(120000);
  });
});

describe('proof files', () => {
  it('serves a proof to any logged-in member but not to anonymous users', async () => {
    const { adminAgent, eventId, member } = await setup();
    const created = await postEntry(adminAgent, eventId).expect(201);
    const memberAgent = await loginAs(ctx.app, member._id);
    const res = await memberAgent.get(created.body.proofUrl).expect(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    await request(ctx.app).get(created.body.proofUrl).expect(401);
  });

  it('does not allow path traversal', async () => {
    const { adminAgent } = await setup();
    await adminAgent.get('/api/proofs/..%2F..%2Fpackage.json').expect(404);
    await adminAgent.get('/api/proofs/does-not-exist.png').expect(404);
  });
});

describe('cash entries and members (v0.2)', () => {
  it('allows cash without a photo; it waits for a bill or a member to confirm', async () => {
    const { adminAgent, eventId } = await setup();
    const res = await post(
      adminAgent,
      eventId,
      { mode: 'cash', counterparty: 'Tea stall' },
      null,
    ).expect(201);
    expect(res.body.proofUrl).toBeUndefined();
    expect(res.body.verification).toMatchObject({ state: 'unverified', needsProof: true });
  });

  it('still needs the screenshot for UPI', async () => {
    const { adminAgent, eventId } = await setup();
    const res = await post(adminAgent, eventId, { mode: 'upi' }, null).expect(400);
    expect(res.body.error).toMatch(/screenshot/i);
  });

  it('links a member and uses their name as the counterparty', async () => {
    const { adminAgent, eventId, member, admin2 } = await setup();
    const res = await post(
      adminAgent,
      eventId,
      {
        direction: 'in',
        mode: 'cash',
        counterparty: 'whatever was typed',
        memberId: String(member._id),
        paidByMemberId: String(admin2._id),
      },
      null,
    ).expect(201);
    expect(res.body).toMatchObject({
      counterparty: 'Chitra Member',
      member: { id: String(member._id), name: 'Chitra Member' },
      paidBy: { id: String(admin2._id), name: 'Bala Admin' },
    });
  });

  it('drops "paid by" when it is the same person', async () => {
    const { adminAgent, eventId, member } = await setup();
    const res = await post(
      adminAgent,
      eventId,
      {
        direction: 'in',
        mode: 'cash',
        memberId: String(member._id),
        paidByMemberId: String(member._id),
      },
      null,
    ).expect(201);
    expect(res.body.paidBy).toBeUndefined();
  });

  it.each([
    ['an unknown member', () => '64b7f0f0f0f0f0f0f0f0f0f0'],
    ['a malformed id', () => 'nope'],
  ])('rejects %s', async (_label, id) => {
    const { adminAgent, eventId } = await setup();
    const res = await post(adminAgent, eventId, { mode: 'cash', memberId: id() }, null).expect(400);
    expect(res.body.error).toMatch(/club member/i);
  });

  it('does not let a viewer be the paying member', async () => {
    const { adminAgent, eventId, viewer } = await setup();
    const res = await post(
      adminAgent,
      eventId,
      { mode: 'cash', memberId: String(viewer._id) },
      null,
    ).expect(400);
    expect(res.body.error).toMatch(/club member/i);
  });

  it('needs a member when "paid by" is set', async () => {
    const { adminAgent, eventId, admin2 } = await setup();
    await post(
      adminAgent,
      eventId,
      { mode: 'cash', paidByMemberId: String(admin2._id) },
      null,
    ).expect(400);
  });

  it('accepts entries on an event made with the shared helper', async () => {
    const { adminAgent } = await setup();
    const id = await makeEvent(adminAgent, { feePaise: 50000 });
    await post(adminAgent, id).expect(201);
  });
});
