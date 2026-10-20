import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Express } from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach } from 'vitest';
import { createApp } from '../src/app';
import { Member } from '../src/models/Member';
import type { Role } from '@nocap/shared';

export { placeholderPng } from '../src/lib/placeholderPng';

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
