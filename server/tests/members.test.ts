import request from 'supertest';
import { describe, expect, it } from 'vitest';
import {
  createCast,
  createMember,
  loginAs,
  makeEvent,
  postEntry,
  useTestApp,
  verify,
} from './helpers';

const ctx = useTestApp();

describe('members list', () => {
  it('lists everyone by name, without phone numbers', async () => {
    const cast = await createCast();
    const viewer = await loginAs(ctx.app, cast.viewer._id);
    const res = await viewer.get('/api/members').expect(200);
    expect(res.body.map((m: { name: string }) => m.name)).toEqual([
      'Asha Admin',
      'Bala Admin',
      'Chitra Member',
      'Dev Viewer',
    ]);
    expect(Object.keys(res.body[0]).sort()).toEqual(['id', 'name', 'role']);
    await request(ctx.app).get('/api/members').expect(401);
  });
});

describe('my payments', () => {
  it('lists the payments I am part of, and which ones I can confirm', async () => {
    const cast = await createCast();
    const esha = await createMember('Esha Member', 'member');
    const admin = await loginAs(ctx.app, cast.admin._id);
    const chitra = await loginAs(ctx.app, cast.member._id);
    const eventId = await makeEvent(admin, { name: 'Freshers 2026' });
    const cashIn = (fields: Record<string, string>) =>
      postEntry(
        admin,
        eventId,
        { direction: 'in', mode: 'cash', amountPaise: '50000', ...fields },
        null,
      ).expect(201);

    const mine = await cashIn({ memberId: String(cast.member._id) });
    // Chitra paid Esha's fee for her: Chitra confirms it.
    const forEsha = await cashIn({
      memberId: String(esha._id),
      paidByMemberId: String(cast.member._id),
    });
    // Bala paid Chitra's fee: Chitra sees it, but Bala confirms it.
    const byBala = await cashIn({
      memberId: String(cast.member._id),
      paidByMemberId: String(cast.admin2._id),
    });
    // Someone else's payment: not shown to Chitra.
    await cashIn({ memberId: String(esha._id) });

    const res = await chitra.get('/api/me/payments').expect(200);
    const rows: { id: string; canRespond: boolean; eventName: string }[] = res.body;
    expect(rows.map((r) => r.id).sort()).toEqual(
      [mine.body.id, forEsha.body.id, byBala.body.id].sort(),
    );
    const canRespond = Object.fromEntries(rows.map((r) => [r.id, r.canRespond]));
    expect(canRespond[mine.body.id]).toBe(true);
    expect(canRespond[forEsha.body.id]).toBe(true);
    expect(canRespond[byBala.body.id]).toBe(false);
    expect(rows[0]!.eventName).toBe('Freshers 2026');

    await verify(chitra, mine.body.id, { outcome: 'confirmed' }).expect(201);
    const after = await chitra.get('/api/me/payments').expect(200);
    const confirmed = after.body.find((r: { id: string }) => r.id === mine.body.id);
    expect(confirmed).toMatchObject({ canRespond: false, verification: { state: 'verified' } });
  });

  it('needs login', async () => {
    await request(ctx.app).get('/api/me/payments').expect(401);
  });
});
