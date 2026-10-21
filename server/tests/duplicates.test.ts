import { describe, expect, it } from 'vitest';
import type { EntryDTO } from '@nocap/shared';
import { createCast, loginAs, makeEvent, postEntry, useTestApp } from './helpers';

const ctx = useTestApp();

async function setup() {
  const cast = await createCast();
  const admin = await loginAs(ctx.app, cast.admin._id);
  const freshers = await makeEvent(admin);
  const fest = await makeEvent(admin, { name: 'Tech Fest' });
  return { admin, freshers, fest };
}

describe('duplicate UPI transaction IDs', () => {
  it('refuses a transaction ID that is already in the ledger, in any event', async () => {
    const s = await setup();
    await postEntry(s.admin, s.freshers, { txnId: '512014334210' }).expect(201);
    const res = await postEntry(s.admin, s.fest, { txnId: '512014334210' }).expect(409);
    expect(res.body.error).toBe(
      'This UPI payment (ref 512014334210) is already recorded: ₹1,200 paid to Decor Shop in Freshers',
    );
  });

  it('compares IDs without spaces and ignoring case', async () => {
    const s = await setup();
    const res = await postEntry(s.admin, s.freshers, { txnId: 'ab 12cd' }).expect(201);
    expect((res.body as EntryDTO).txnId).toBe('AB12CD');
    await postEntry(s.admin, s.freshers, { txnId: ' AB12 CD ' }).expect(409);
  });

  it('lets a correction keep the transaction ID of the entry it replaces', async () => {
    const s = await setup();
    const first = await postEntry(s.admin, s.freshers, { txnId: '9001' }).expect(201);
    const fix = await postEntry(s.admin, s.freshers, {
      txnId: '9001',
      amountPaise: '125000',
      correctsEntryId: first.body.id,
      reason: 'The screenshot says ₹1,250',
    }).expect(201);
    // The corrected version now holds the ID, so a brand-new entry still can't reuse it.
    await postEntry(s.admin, s.freshers, { txnId: '9001' }).expect(409);
    await postEntry(s.admin, s.freshers, {
      txnId: '9001',
      amountPaise: '120000',
      correctsEntryId: fix.body.id,
      reason: 'Back to ₹1,200',
    }).expect(201);
  });

  it('frees the ID once the entry is voided', async () => {
    const s = await setup();
    const first = await postEntry(s.admin, s.freshers, { txnId: '9002' }).expect(201);
    await postEntry(s.admin, s.freshers, {
      amountPaise: '0',
      correctsEntryId: first.body.id,
      reason: 'Recorded in the wrong event',
    }).expect(201);
    await postEntry(s.admin, s.fest, { txnId: '9002' }).expect(201);
  });
});
