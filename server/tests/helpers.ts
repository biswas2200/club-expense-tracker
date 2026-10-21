import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Express } from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach } from 'vitest';
import { createApp } from '../src/app';
import { Member } from '../src/models/Member';
import {
  addPngText,
  SAMPLE_PAYMENT_KEY,
  type BotMessageDTO,
  type Role,
  type SamplePayment,
} from '@nocap/shared';

import { placeholderPng } from '../src/lib/placeholderPng';

export { placeholderPng };

const MONGO_URL = process.env.TEST_MONGODB_URL ?? 'mongodb://localhost:27017';

export interface TestContext {
  app: Express;
  uploadDir: string;
}

/**
 * Gives each test file its own database on the Docker MongoDB and its own upload folder,
 * wiped before every test so tests never depend on each other.
 */
export function useTestApp(options: { devLogin?: boolean } = {}): TestContext {
  const ctx = {} as TestContext;
  const dbName = `nocap_test_${process.pid}_${Math.random().toString(36).slice(2, 8)}`;

  beforeAll(async () => {
    await mongoose.connect(`${MONGO_URL}/${dbName}`);
    await mongoose.connection.syncIndexes();
    ctx.uploadDir = await mkdtemp(path.join(tmpdir(), 'nocap-uploads-'));
    ctx.app = createApp({
      uploadDir: ctx.uploadDir,
      sessionSecret: 'test-secret',
      devLogin: options.devLogin ?? true,
    });
  });

  beforeEach(async () => {
    const collections = await mongoose.connection.db!.collections();
    await Promise.all(collections.map((c) => c.deleteMany({})));
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    await rm(ctx.uploadDir, { recursive: true, force: true });
  });

  return ctx;
}

export async function createMember(name: string, role: Role) {
  return Member.create({ name, role, phone: `9${Math.floor(Math.random() * 1e9)}` });
}

/** Creates one member of each role, as most tests need them. */
export async function createCast() {
  const [admin, admin2, member, viewer] = await Promise.all([
    createMember('Asha Admin', 'admin'),
    createMember('Bala Admin', 'admin'),
    createMember('Chitra Member', 'member'),
    createMember('Dev Viewer', 'viewer'),
  ]);
  return { admin: admin!, admin2: admin2!, member: member!, viewer: viewer! };
}

/** Returns a supertest agent that keeps the login cookie between requests. */
export async function loginAs(app: Express, memberId: unknown) {
  const agent = request.agent(app);
  await agent
    .post('/api/auth/dev-login')
    .send({ memberId: String(memberId) })
    .expect(200);
  return agent;
}

/** Creates an event as the given admin and returns its id. */
export async function makeEvent(agent: request.Agent, fields: Record<string, unknown> = {}) {
  const res = await agent
    .post('/api/events')
    .send({ name: 'Freshers', budgetPaise: 1_000_000, ...fields })
    .expect(201);
  return res.body.id as string;
}

const OPTIONAL_ENTRY_FIELDS = [
  'txnId',
  'note',
  'correctsEntryId',
  'reason',
  'memberId',
  'paidByMemberId',
];

/** Posts an entry as multipart, the way the browser does. Pass proof = null for none. */
export function postEntry(
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
  for (const key of OPTIONAL_ENTRY_FIELDS) {
    if (fields[key] !== undefined) req.field(key, fields[key]);
  }
  if (proof) req.attach('proof', proof, { filename: 'shot.png', contentType: 'image/png' });
  return req;
}

export const GROUP_CHAT = 'group-sparks';
export const dmOf = (person: { _id: unknown }) => `dm-${String(person._id)}`;

/** A screenshot the mock parser can read, standing in for a real GPay or PhonePe one. */
export function sampleShot(payment: Partial<SamplePayment>) {
  return Buffer.from(addPngText(placeholderPng(), SAMPLE_PAYMENT_KEY, JSON.stringify(payment)));
}

/** Sends a message in the chat simulator. Returns the request so tests can assert on it. */
export function chat(
  agent: request.Agent,
  chatId: string,
  message: { text?: string; senderId?: unknown; image?: Buffer; imageType?: string },
) {
  const req = agent.post(`/api/sim/chats/${chatId}/messages`);
  if (message.text !== undefined) req.field('text', message.text);
  if (message.senderId) req.field('senderId', String(message.senderId));
  if (message.image) {
    req.attach('image', message.image, {
      filename: 'shot.png',
      contentType: message.imageType ?? 'image/png',
    });
  }
  return req;
}

/** The text of the bot's last message in a thread. */
export function lastBotText(thread: BotMessageDTO[]) {
  return thread.filter((m) => m.from === 'bot').at(-1)?.text ?? '';
}

/** Confirms or disputes an entry; attaches a bill photo when one is given. */
export function verify(
  agent: request.Agent,
  entryId: string,
  body: { outcome: string; note?: string },
  bill?: Buffer,
) {
  const req = agent.post(`/api/entries/${entryId}/verifications`);
  if (!bill) return req.send(body);
  req.field('outcome', body.outcome);
  if (body.note) req.field('note', body.note);
  return req.attach('proof', bill, { filename: 'bill.png', contentType: 'image/png' });
}
