import { describe, expect, it } from 'vitest';
import { Event } from '../src/models/Event';
import { LedgerEntry } from '../src/models/LedgerEntry';
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
