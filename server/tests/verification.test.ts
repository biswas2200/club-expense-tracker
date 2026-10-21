import request from 'supertest';
import { describe, expect, it } from 'vitest';
import {
  createCast,
  createMember,
  loginAs,
  makeEvent,
  placeholderPng,
  postEntry,
  useTestApp,
  verify,
} from './helpers';

const ctx = useTestApp();

async function setup() {
  const cast = await createCast();
  const admin = await loginAs(ctx.app, cast.admin._id);
  const admin2 = await loginAs(ctx.app, cast.admin2._id);
  const member = await loginAs(ctx.app, cast.member._id);
  const viewer = await loginAs(ctx.app, cast.viewer._id);
  const eventId = await makeEvent(admin);
  return { cast, admin, admin2, member, viewer, eventId };
}

/** Cash collected from the cast's member, recorded by the first admin, with no photo. */
async function memberPayment(s: Awaited<ReturnType<typeof setup>>) {
  const res = await postEntry(
    s.admin,
    s.eventId,
    { direction: 'in', mode: 'cash', amountPaise: '50000', memberId: String(s.cast.member._id) },
    null,
  ).expect(201);
  return res.body;
}

describe('verifying entries', () => {
  it('starts every new entry as unverified and names who must confirm it', async () => {
    const s = await setup();
    const entry = await memberPayment(s);
    expect(entry.verification).toMatchObject({
      state: 'unverified',
      confirmer: { name: 'Chitra Member' },
      needsProof: false,
    });
  });

  it('lets the member who paid confirm their payment', async () => {
    const s = await setup();
    const entry = await memberPayment(s);
    const res = await verify(s.member, entry.id, { outcome: 'confirmed' }).expect(201);
    expect(res.body.verification).toMatchObject({
      state: 'verified',
      by: { name: 'Chitra Member' },
    });
    expect(res.body.verification.at).toEqual(expect.any(String));
  });

  it('lets the member dispute a payment, with a note', async () => {
    const s = await setup();
    const entry = await memberPayment(s);
    const res = await verify(s.member, entry.id, {
      outcome: 'disputed',
      note: 'I paid ₹300, not ₹500',
    }).expect(201);
    expect(res.body.verification).toMatchObject({
      state: 'disputed',
      note: 'I paid ₹300, not ₹500',
    });
  });

  it('needs a note to dispute', async () => {
    const s = await setup();
    const entry = await memberPayment(s);
    const res = await verify(s.member, entry.id, { outcome: 'disputed' }).expect(400);
    expect(res.body.error).toMatch(/say what is wrong/i);
  });

  it('lets a member confirm after disputing', async () => {
    const s = await setup();
    const entry = await memberPayment(s);
    await verify(s.member, entry.id, { outcome: 'disputed', note: 'Not sure' }).expect(201);
    const res = await verify(s.member, entry.id, { outcome: 'confirmed' }).expect(201);
    expect(res.body.verification.state).toBe('verified');
  });

  it('only the member involved can confirm a member payment', async () => {
    const s = await setup();
    const entry = await memberPayment(s);
    const res = await verify(s.admin2, entry.id, { outcome: 'confirmed' }).expect(403);
    expect(res.body.error).toMatch(/only Chitra Member/i);
  });

  it('does not let anyone verify an entry they recorded', async () => {
    const s = await setup();
    const entry = await postEntry(s.admin, s.eventId).expect(201);
    const res = await verify(s.admin, entry.body.id, { outcome: 'confirmed' }).expect(403);
    expect(res.body.error).toMatch(/someone else/i);
  });

  it('lets another admin verify a UPI entry by checking its screenshot', async () => {
    const s = await setup();
    const entry = await postEntry(s.admin, s.eventId).expect(201);
    const res = await verify(s.admin2, entry.body.id, { outcome: 'confirmed' }).expect(201);
    expect(res.body.verification).toMatchObject({ state: 'verified', by: { name: 'Bala Admin' } });
  });

  it.each(['member', 'viewer'] as const)(
    'does not let a %s verify an entry with no member involved',
    async (role) => {
      const s = await setup();
      const entry = await postEntry(s.admin, s.eventId).expect(201);
      await verify(s[role], entry.body.id, { outcome: 'confirmed' }).expect(403);
    },
  );

  it('needs a bill photo before cash spent can be verified', async () => {
    const s = await setup();
    const entry = await postEntry(
      s.admin,
      s.eventId,
      { mode: 'cash', counterparty: 'Tea stall', amountPaise: '20000' },
      null,
    ).expect(201);
    expect(entry.body.verification.needsProof).toBe(true);
    expect(entry.body.proofUrl).toBeUndefined();

    const refused = await verify(s.admin2, entry.body.id, { outcome: 'confirmed' }).expect(400);
    expect(refused.body.error).toMatch(/bill/i);

    const res = await verify(
      s.admin2,
      entry.body.id,
      { outcome: 'confirmed' },
      placeholderPng(),
    ).expect(201);
    expect(res.body.verification).toMatchObject({ state: 'verified', needsProof: false });
    expect(res.body.proofUrl).toMatch(/^\/api\/proofs\/[\w-]+\.png$/);
  });

  it('rejects a bill that is not an image or PDF', async () => {
    const s = await setup();
    const entry = await postEntry(s.admin, s.eventId, { mode: 'cash' }, null).expect(201);
    await verify(
      s.admin2,
      entry.body.id,
      { outcome: 'confirmed' },
      Buffer.from('not an image'),
    ).expect(400);
  });

  it('lets the person who paid on someone else’s behalf confirm, not the beneficiary', async () => {
    const s = await setup();
    const entry = await postEntry(
      s.admin,
      s.eventId,
      {
        direction: 'in',
        mode: 'cash',
        amountPaise: '50000',
        memberId: String(s.cast.member._id),
        paidByMemberId: String(s.cast.admin2._id),
      },
      null,
    ).expect(201);
    expect(entry.body.verification.confirmer).toMatchObject({ name: 'Bala Admin' });

    const refused = await verify(s.member, entry.body.id, { outcome: 'confirmed' }).expect(403);
    expect(refused.body.error).toMatch(/only Bala Admin/i);
    await verify(s.admin2, entry.body.id, { outcome: 'confirmed' }).expect(201);
  });

  it('refuses to verify an entry twice', async () => {
    const s = await setup();
    const entry = await memberPayment(s);
    await verify(s.member, entry.id, { outcome: 'confirmed' }).expect(201);
    const res = await verify(s.member, entry.id, { outcome: 'confirmed' }).expect(409);
    expect(res.body.error).toMatch(/already verified/i);
  });

  it('only verifies the latest version of an entry', async () => {
    const s = await setup();
    const entry = await postEntry(s.admin, s.eventId).expect(201);
    await postEntry(s.admin, s.eventId, {
      correctsEntryId: entry.body.id,
      reason: 'Wrong amount',
      amountPaise: '100000',
    }).expect(201);
    const res = await verify(s.admin2, entry.body.id, { outcome: 'confirmed' }).expect(400);
    expect(res.body.error).toMatch(/latest version/i);
  });

  it('a correction starts unverified even if the original was verified', async () => {
    const s = await setup();
    const entry = await postEntry(s.admin, s.eventId).expect(201);
    await verify(s.admin2, entry.body.id, { outcome: 'confirmed' }).expect(201);
    const fix = await postEntry(s.admin, s.eventId, {
      correctsEntryId: entry.body.id,
      reason: 'Wrong amount',
      amountPaise: '100000',
    }).expect(201);
    expect(fix.body.verification.state).toBe('unverified');
  });

  it('rejects an unknown outcome', async () => {
    const s = await setup();
    const entry = await memberPayment(s);
    await verify(s.member, entry.id, { outcome: 'maybe' }).expect(400);
  });

  it('needs login, and 404s for an unknown entry', async () => {
    const s = await setup();
    const entry = await memberPayment(s);
    await request(ctx.app)
      .post(`/api/entries/${entry.id}/verifications`)
      .send({ outcome: 'confirmed' })
      .expect(401);
    await verify(s.member, '64b7f0f0f0f0f0f0f0f0f0f0', { outcome: 'confirmed' }).expect(404);
  });

  it('shows the verification in the event ledger and the event totals', async () => {
    const s = await setup();
    const extra = await createMember('Esha Member', 'member');
    const a = await memberPayment(s);
    await postEntry(
      s.admin,
      s.eventId,
      { direction: 'in', mode: 'cash', amountPaise: '30000', memberId: String(extra._id) },
      null,
    ).expect(201);
    await verify(s.member, a.id, { outcome: 'confirmed' }).expect(201);

    const list = await s.viewer.get(`/api/events/${s.eventId}/entries`).expect(200);
    const states = list.body.map((e: { verification: { state: string } }) => e.verification.state);
    expect(states.sort()).toEqual(['unverified', 'verified']);

    const event = await s.viewer.get(`/api/events/${s.eventId}`).expect(200);
    expect(event.body.summary).toMatchObject({ unverifiedCount: 1, unverifiedPaise: 30000 });
  });

  it('falls back to another admin when the paying member recorded it themselves', async () => {
    const s = await setup();
    // Asha records her own fee: she cannot confirm it, so Bala checks the screenshot.
    const entry = await postEntry(s.admin, s.eventId, {
      direction: 'in',
      amountPaise: '50000',
      memberId: String(s.cast.admin._id),
    }).expect(201);
    expect(entry.body.verification.confirmer).toBeUndefined();
    await verify(s.admin, entry.body.id, { outcome: 'confirmed' }).expect(403);
    const res = await verify(s.admin2, entry.body.id, { outcome: 'confirmed' }).expect(201);
    expect(res.body.verification).toMatchObject({ state: 'verified', by: { name: 'Bala Admin' } });
  });
});
