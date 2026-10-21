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

async function setup(feePaise = 50_000) {
  const cast = await createCast(); // Asha Admin, Bala Admin, Chitra Member, Dev Viewer
  const esha = await createMember('Esha Member', 'member');
  const farid = await createMember('Farid Member', 'member');
  const admin = await loginAs(ctx.app, cast.admin._id);
  const eventId = await makeEvent(admin, { feePaise });
  const pay = (memberId: unknown, amountPaise: string, extra: Record<string, string> = {}) =>
    postEntry(
      admin,
      eventId,
      { direction: 'in', mode: 'cash', amountPaise, memberId: String(memberId), ...extra },
      null,
    ).expect(201);
  return { cast, esha, farid, admin, eventId, pay };
}

type FeeRow = {
  member: { name: string };
  state: string;
  paidPaise: number;
  paidBy: { name: string }[];
};
const byName = (rows: FeeRow[], name: string) => rows.find((r) => r.member.name === name)!;

describe('event fees', () => {
  it('lists every admin and member with their fee status; viewers do not pay', async () => {
    const s = await setup();
    const chitra = await s.pay(s.cast.member._id, '50000');
    await verify(await loginAs(ctx.app, s.cast.member._id), chitra.body.id, {
      outcome: 'confirmed',
    }).expect(201);
    await s.pay(s.esha._id, '50000');
    await s.pay(s.farid._id, '30000');
    const bala = await s.pay(s.cast.admin2._id, '50000');
    await verify(await loginAs(ctx.app, s.cast.admin2._id), bala.body.id, {
      outcome: 'disputed',
      note: 'I paid by UPI, not cash',
    }).expect(201);

    const res = await s.admin.get(`/api/events/${s.eventId}/fees`).expect(200);
    expect(res.body.feePaise).toBe(50000);
    expect(res.body.counts).toEqual({ paid: 1, awaiting: 1, partly: 1, disputed: 1, unpaid: 1 });
    const rows: FeeRow[] = res.body.rows;
    expect(rows.map((r) => r.member.name).sort()).toEqual([
      'Asha Admin',
      'Bala Admin',
      'Chitra Member',
      'Esha Member',
      'Farid Member',
    ]);
    expect(byName(rows, 'Chitra Member')).toMatchObject({ state: 'paid', paidPaise: 50000 });
    expect(byName(rows, 'Esha Member')).toMatchObject({ state: 'awaiting', paidPaise: 50000 });
    expect(byName(rows, 'Farid Member')).toMatchObject({ state: 'partly', paidPaise: 30000 });
    expect(byName(rows, 'Bala Admin')).toMatchObject({ state: 'disputed' });
    expect(byName(rows, 'Asha Admin')).toMatchObject({ state: 'unpaid', paidPaise: 0 });
  });

  it('puts the people who still owe money first', async () => {
    const s = await setup();
    await s.pay(s.esha._id, '50000');
    const res = await s.admin.get(`/api/events/${s.eventId}/fees`).expect(200);
    expect(res.body.rows.at(-1).member.name).toBe('Esha Member');
    expect(res.body.rows[0].state).toBe('unpaid');
  });

  it('shows who paid on someone else’s behalf', async () => {
    const s = await setup();
    await s.pay(s.esha._id, '50000', { paidByMemberId: String(s.cast.admin2._id) });
    const res = await s.admin.get(`/api/events/${s.eventId}/fees`).expect(200);
    expect(byName(res.body.rows, 'Esha Member').paidBy).toEqual([
      { id: String(s.cast.admin2._id), name: 'Bala Admin' },
    ]);
  });

  it('ignores replaced and voided entries', async () => {
    const s = await setup();
    const paid = await s.pay(s.cast.member._id, '50000');
    await postEntry(
      s.admin,
      s.eventId,
      {
        direction: 'in',
        mode: 'cash',
        amountPaise: '0',
        memberId: String(s.cast.member._id),
        correctsEntryId: paid.body.id,
        reason: 'Entered for the wrong person',
      },
      null,
    ).expect(201);
    const res = await s.admin.get(`/api/events/${s.eventId}/fees`).expect(200);
    expect(byName(res.body.rows, 'Chitra Member')).toMatchObject({ state: 'unpaid', paidPaise: 0 });
  });

  it('has no fee list when the event has no fee', async () => {
    const s = await setup(0);
    const res = await s.admin.get(`/api/events/${s.eventId}/fees`).expect(200);
    expect(res.body).toEqual({
      feePaise: 0,
      counts: { paid: 0, awaiting: 0, partly: 0, disputed: 0, unpaid: 0 },
      rows: [],
    });
  });

  it('is visible to every role', async () => {
    const s = await setup();
    const viewer = await loginAs(ctx.app, s.cast.viewer._id);
    await viewer.get(`/api/events/${s.eventId}/fees`).expect(200);
  });
});
