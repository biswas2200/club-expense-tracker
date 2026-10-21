/**
 * Resets the local database to a demo club and builds it through the real services, so the
 * activity log, verifications and cash count are exactly what the app would have recorded.
 * Development only.
 *
 *   npm run seed
 */
import { mkdir, rm } from 'node:fs/promises';
import mongoose, { Types } from 'mongoose';
import type { EntryDTO } from '@nocap/shared';
import { config } from './config';
import { placeholderPng } from './lib/placeholderPng';
import { Member, type MemberDoc } from './models/Member';
import { recordCashCount } from './services/cash';
import { createEntry } from './services/entries';
import { createEvent } from './services/events';
import { verifyEntry } from './services/verification';
import { Event } from './models/Event';

if (config.isProduction) {
  throw new Error('Refusing to seed a production database');
}

const rupees = (r: number) => String(Math.round(r * 100));
type Rgb = [number, number, number];
const GREEN: Rgb = [22, 163, 74];
const BLUE: Rgb = [37, 99, 235];
const AMBER: Rgb = [217, 119, 6];

export async function seed() {
  // Everything is append-only through Mongoose, so a dev reset goes through the raw driver.
  const db = mongoose.connection.db!;
  for (const name of [
    'members',
    'events',
    'ledger_entries',
    'verifications',
    'cash_counts',
    'audit_log',
    'bot_messages',
    'bot_chats',
    'bot_pings',
  ]) {
    await db.collection(name).deleteMany({});
  }
  await rm(config.uploadDir, { recursive: true, force: true });
  await mkdir(config.uploadDir, { recursive: true });

  const people = (await Member.insertMany([
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
  ])) as MemberDoc[];
  const who = (name: string) => people.find((p) => p.name === name)!;
  const [rohan, priya, arjun] = [who('Rohan Mehta'), who('Priya Nair'), who('Arjun Rao')];
  const id = (p: MemberDoc) => String(p._id);

  async function seedEvent(name: string, budget: number, fee = 0) {
    const dto = await createEvent(rohan, {
      name,
      budgetPaise: Number(rupees(budget)),
      feePaise: Number(rupees(fee)),
    });
    const eventId = new Types.ObjectId(dto.id);
    const record = (actor: MemberDoc, fields: Record<string, string>, proof?: Rgb) =>
      createEntry({
        eventId,
        body: fields,
        file: proof ? { buffer: placeholderPng(proof) } : undefined,
        member: actor,
        uploadDir: config.uploadDir,
      });
    return { eventId, record };
  }
  const check = (actor: MemberDoc, entry: EntryDTO, outcome = 'confirmed', note?: string) =>
    verifyEntry({ entryId: entry.id, actor, body: { outcome, note }, uploadDir: config.uploadDir });

  // ---- Freshers Party 2026: ₹500 fee per member -----------------------------------------
  const freshers = await seedEvent('Freshers Party 2026', 25000, 500);
  const fee = (
    payer: string,
    day: string,
    mode: 'upi' | 'cash',
    extra: Record<string, string> = {},
    by = priya,
  ) =>
    freshers.record(
      by,
      {
        direction: 'in',
        mode,
        amountPaise: rupees(500),
        counterparty: payer,
        occurredAt: `2026-10-${day}`,
        memberId: id(who(payer)),
        note: 'Freshers fee',
        ...(mode === 'upi' ? { txnId: `5120${day}${payer.length}8831` } : {}),
        ...extra,
      },
      mode === 'upi' ? GREEN : undefined,
    );

  const sneha = await fee('Sneha Kulkarni', '06', 'upi');
  await fee('Karthik Iyer', '06', 'upi');
  const vikram = await fee('Vikram Shetty', '07', 'upi');
  await fee('Ananya Gupta', '07', 'cash', { note: 'Freshers fee, paid in class' });
  const meera = await fee('Meera Joshi', '07', 'cash', { note: 'Freshers fee, paid in class' });
  const rohanFee = await fee('Rohan Mehta', '08', 'upi');
  const priyaFee = await fee('Priya Nair', '08', 'upi');
  await fee('Rahul Das', '08', 'cash', { paidByMemberId: id(rohan), note: 'Rohan paid for Rahul' });

  const out = (
    party: string,
    amount: number,
    day: string,
    mode: 'upi' | 'cash',
    note: string,
    proof?: Rgb,
    txnId?: string,
  ) =>
    freshers.record(
      priya,
      {
        direction: 'out',
        mode,
        amountPaise: rupees(amount),
        counterparty: party,
        occurredAt: `2026-10-${day}`,
        note,
        ...(txnId ? { txnId } : {}),
      },
      proof,
    );

  const cafe = await freshers.record(
    priya,
    {
      direction: 'in',
      mode: 'upi',
      amountPaise: rupees(10000),
      counterparty: 'Campus Cafe (sponsor)',
      occurredAt: '2026-10-08',
      txnId: '512008776610',
      note: 'Sponsorship',
    },
    GREEN,
  );
  const classFund = await freshers.record(
    priya,
    {
      direction: 'in',
      mode: 'cash',
      amountPaise: rupees(4000),
      counterparty: 'Class fund (from the CR)',
      occurredAt: '2026-10-09',
      note: 'Leftover class fund handed over',
    },
    GREEN,
  );
  const decor = await out(
    'Decor Shop',
    1200,
    '14',
    'upi',
    'Balloons and streamers',
    BLUE,
    '512014334210',
  );
  await out('Sound & Lights Co.', 6000, '15', 'upi', 'DJ advance', BLUE, '512015902211');
  const bake = await out('Bake House', 3450, '16', 'cash', 'Snacks', AMBER);
  const banner = await out('Print Point', 850, '16', 'cash', 'Banners', AMBER);
  await out('Tea stall', 200, '17', 'cash', 'Tea and water for the setup team');

  await freshers.record(arjun, {
    direction: 'out',
    mode: 'cash',
    amountPaise: rupees(580),
    counterparty: 'Print Point',
    occurredAt: '2026-10-16',
    note: 'Banners',
    correctsEntryId: banner.id,
    reason: 'Typo: the bill says ₹580',
  });

  await check(who('Sneha Kulkarni'), sneha);
  await check(who('Vikram Shetty'), vikram);
  await check(rohan, rohanFee);
  await check(arjun, priyaFee); // Priya recorded her own fee, so another admin checks it.
  await check(who('Meera Joshi'), meera, 'disputed', 'I paid ₹300 in cash; ₹200 is still due');
  await check(arjun, cafe);
  await check(arjun, decor);
  await check(rohan, classFund);
  await check(rohan, bake);

  const freshersEvent = await Event.findById(freshers.eventId).lean();
  await recordCashCount(freshersEvent!, rohan, {
    countedPaise: Number(rupees(1220)),
    note: 'Cash box after the snacks run',
  });

  // ---- Tech Fest 2026 --------------------------------------------------------------------
  const fest = await seedEvent('Tech Fest 2026', 40000);
  const alumni = await fest.record(
    priya,
    {
      direction: 'in',
      mode: 'upi',
      amountPaise: rupees(10000),
      counterparty: 'Alumni association',
      occurredAt: '2026-10-18',
      txnId: '512018120045',
      note: 'Sponsorship',
    },
    GREEN,
  );
  await check(arjun, alumni);

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
