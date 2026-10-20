/**
 * Resets the local database to a demo club: 10 members, two events and a handful of entries
 * (including one correction). Development only.
 *
 *   npm run seed
 */
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { config } from './config';
import { placeholderPng } from './lib/placeholderPng';
import { Event } from './models/Event';
import { LedgerEntry } from './models/LedgerEntry';
import { Member } from './models/Member';

if (config.isProduction) {
  throw new Error('Refusing to seed a production database');
}

const rupees = (r: number) => Math.round(r * 100);

async function proof(accent: [number, number, number]) {
  const file = `${randomUUID()}.png`;
  await writeFile(path.join(config.uploadDir, file), placeholderPng(accent));
  return file;
}

export async function seed() {
  // The ledger is append-only through Mongoose, so a dev reset goes through the raw driver.
  const db = mongoose.connection.db!;
  for (const name of ['members', 'events', 'ledger_entries']) {
    await db.collection(name).deleteMany({});
  }
  await rm(config.uploadDir, { recursive: true, force: true });
  await mkdir(config.uploadDir, { recursive: true });

  const people = await Member.insertMany([
    { name: 'Rohan Mehta', role: 'admin', phone: '9000000001' },
    { name: 'Priya Nair', role: 'admin', phone: '9000000002' },
    { name: 'Arjun Rao', role: 'admin', phone: '9000000003' },
    { name: 'Sneha Kulkarni', role: 'member', phone: '9000000004' },
    { name: 'Karthik Iyer', role: 'member', phone: '9000000005' },
    { name: 'Ananya Gupta', role: 'member', phone: '9000000006' },
    { name: 'Vikram Shetty', role: 'member', phone: '9000000007' },
    { name: 'Meera Joshi', role: 'member', phone: '9000000008' },
    { name: 'Rahul Das', role: 'member', phone: '9000000009' },
    { name: 'Prof. S. Kavitha', role: 'viewer', phone: '9000000010' },
  ]);
  const by = Object.fromEntries(people.map((p) => [p.name, p._id]));
  const treasurer = by['Priya Nair'];

  const freshers = await Event.create({
    name: 'Freshers Party 2026',
    budgetPaise: rupees(25000),
    createdBy: by['Rohan Mehta'],
  });
  const fest = await Event.create({
    name: 'Tech Fest 2026',
    budgetPaise: rupees(40000),
    createdBy: by['Rohan Mehta'],
  });

  const green: [number, number, number] = [22, 163, 74];
  const blue: [number, number, number] = [37, 99, 235];
  const amber: [number, number, number] = [217, 119, 6];

  const add = async (fields: Record<string, unknown>) =>
    LedgerEntry.create({ createdBy: treasurer, eventId: freshers._id, ...fields });

  for (const [name, day] of [
    ['Sneha Kulkarni', '06'],
    ['Karthik Iyer', '06'],
    ['Vikram Shetty', '07'],
  ] as const) {
    await add({
      direction: 'in',
      mode: 'upi',
      amountPaise: rupees(500),
      counterparty: name,
      occurredAt: new Date(`2026-10-${day}`),
      txnId: `5120${day}${name.length}8831`,
      note: 'Freshers fee',
      proofPath: await proof(green),
    });
  }
  await add({
    direction: 'in',
    mode: 'cash',
    amountPaise: rupees(500),
    counterparty: 'Ananya Gupta',
    occurredAt: new Date('2026-10-07'),
    note: 'Freshers fee, paid in class',
    proofPath: await proof(green),
  });
  await add({
    direction: 'in',
    mode: 'upi',
    amountPaise: rupees(10000),
    counterparty: 'Campus Cafe (sponsor)',
    occurredAt: new Date('2026-10-08'),
    txnId: '512008776610',
    note: 'Sponsorship',
    proofPath: await proof(green),
  });

  await add({
    direction: 'out',
    mode: 'upi',
    amountPaise: rupees(1200),
    counterparty: 'Decor Shop',
    occurredAt: new Date('2026-10-14'),
    txnId: '512014334210',
    note: 'Balloons and streamers',
    proofPath: await proof(blue),
  });
  await add({
    direction: 'out',
    mode: 'upi',
    amountPaise: rupees(6000),
    counterparty: 'Sound & Lights Co.',
    occurredAt: new Date('2026-10-15'),
    txnId: '512015902211',
    note: 'DJ advance',
    proofPath: await proof(blue),
  });
  await add({
    direction: 'out',
    mode: 'cash',
    amountPaise: rupees(3450),
    counterparty: 'Bake House',
    occurredAt: new Date('2026-10-16'),
    note: 'Snacks',
    proofPath: await proof(amber),
  });

  const banner = await add({
    direction: 'out',
    mode: 'cash',
    amountPaise: rupees(850),
    counterparty: 'Print Point',
    occurredAt: new Date('2026-10-16'),
    note: 'Banners',
    proofPath: await proof(amber),
  });
  await add({
    direction: 'out',
    mode: 'cash',
    amountPaise: rupees(580),
    counterparty: 'Print Point',
    occurredAt: new Date('2026-10-16'),
    note: 'Banners',
    proofPath: banner.proofPath,
    correctsEntryId: banner._id,
    reason: 'Typo: the bill says ₹580',
    createdBy: by['Arjun Rao'],
  });

  await LedgerEntry.create({
    eventId: fest._id,
    createdBy: treasurer,
    direction: 'in',
    mode: 'upi',
    amountPaise: rupees(10000),
    counterparty: 'Alumni association',
    occurredAt: new Date('2026-10-18'),
    txnId: '512018120045',
    note: 'Sponsorship',
    proofPath: await proof(green),
  });

  return { members: people.length, events: 2 };
}

// Run directly: `tsx src/seed.ts`
if (import.meta.filename === process.argv[1] || process.argv[1]?.endsWith('seed.ts')) {
  await mongoose.connect(config.mongoUri);
  await mongoose.connection.syncIndexes();
  const result = await seed();
  console.log(
    `Seeded ${mongoose.connection.name}: ${result.members} members, ${result.events} events`,
  );
  await mongoose.disconnect();
}
