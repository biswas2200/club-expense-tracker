import { describe, expect, it } from 'vitest';
import { Event } from '../src/models/Event';
import { AuditEvent } from '../src/models/AuditEvent';
import { CashCount } from '../src/models/CashCount';
import { LedgerEntry } from '../src/models/LedgerEntry';
import { Verification } from '../src/models/Verification';
import { createCast, useTestApp } from './helpers';

useTestApp();

async function makeEntry() {
  const { admin } = await createCast();
  const event = await Event.create({
    name: 'Freshers',
    budgetPaise: 100_000,
    createdBy: admin._id,
  });
  return LedgerEntry.create({
    eventId: event._id,
    direction: 'out',
    mode: 'upi',
    amountPaise: 12_000,
    counterparty: 'Decor Shop',
    occurredAt: new Date('2026-10-14'),
    proofPath: 'proof.png',
    createdBy: admin._id,
  });
}

describe('LedgerEntry is append-only at the model level', () => {
  it('refuses to save changes to an existing entry', async () => {
    const entry = await makeEntry();
    entry.amountPaise = 1;
    await expect(entry.save()).rejects.toThrow(/append-only/);
  });

  it.each([
    ['updateOne', () => LedgerEntry.updateOne({}, { amountPaise: 1 })],
    ['updateMany', () => LedgerEntry.updateMany({}, { amountPaise: 1 })],
    ['findOneAndUpdate', () => LedgerEntry.findOneAndUpdate({}, { amountPaise: 1 })],
    ['replaceOne', () => LedgerEntry.replaceOne({}, { amountPaise: 1 })],
    ['deleteOne', () => LedgerEntry.deleteOne({})],
    ['deleteMany', () => LedgerEntry.deleteMany({})],
    ['findOneAndDelete', () => LedgerEntry.findOneAndDelete({})],
  ])('refuses %s', async (_name, run) => {
    await makeEntry();
    await expect(run()).rejects.toThrow(/append-only/);
    const stored = await LedgerEntry.findOne().lean();
    expect(stored?.amountPaise).toBe(12_000);
  });

  it('refuses document deleteOne', async () => {
    const entry = await makeEntry();
    await expect(entry.deleteOne()).rejects.toThrow(/append-only/);
    expect(await LedgerEntry.countDocuments()).toBe(1);
  });
});

describe('verifications, cash counts and the audit log are append-only too', () => {
  async function makeAll() {
    const entry = await makeEntry();
    const verification = await Verification.create({
      entryId: entry._id,
      eventId: entry.eventId,
      verifiedBy: entry.createdBy,
      outcome: 'confirmed',
      method: 'admin',
    });
    const count = await CashCount.create({
      eventId: entry.eventId,
      countedBy: entry.createdBy,
      countedPaise: 100,
      expectedPaise: 100,
      differencePaise: 0,
    });
    const audit = await AuditEvent.create({
      actorId: entry.createdBy,
      action: 'entry.recorded',
      summary: 'Recorded',
    });
    return { verification, count, audit };
  }

  it('refuses updates and deletes on each of them', async () => {
    const { verification, count, audit } = await makeAll();
    for (const doc of [verification, count, audit]) {
      const model = doc.constructor as typeof Verification;
      await expect(model.updateOne({}, { $set: { note: 'changed' } })).rejects.toThrow(
        /append-only/,
      );
      await expect(model.deleteMany({})).rejects.toThrow(/append-only/);
      await expect(doc.deleteOne()).rejects.toThrow(/append-only/);
    }
    expect(await Verification.countDocuments()).toBe(1);
    expect(await CashCount.countDocuments()).toBe(1);
    expect(await AuditEvent.countDocuments()).toBe(1);
  });
});
