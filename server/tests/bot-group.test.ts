import { describe, expect, it } from 'vitest';
import type { BotMessageDTO } from '@nocap/shared';
import { handleMessage } from '../src/bot/engine';
import { mockScreenshotParser } from '../src/bot/parser';
import {
  chat,
  createCast,
  GROUP_CHAT,
  lastBotText,
  loginAs,
  makeEvent,
  placeholderPng,
  postEntry,
  useTestApp,
  verify,
} from './helpers';

const ctx = useTestApp();

/**
 * Freshers has a ₹500 fee: Bala paid and confirmed, Chitra paid in cash and has not
 * confirmed, Asha has not paid. ₹1,200 went to Decor Shop. Tech Fest is newer and has no fee.
 */
async function setup() {
  const cast = await createCast();
  const asha = await loginAs(ctx.app, cast.admin._id);
  const bala = await loginAs(ctx.app, cast.admin2._id);
  const freshers = await makeEvent(asha, {
    name: 'Freshers Party 2026',
    budgetPaise: 2_500_000,
    feePaise: 50_000,
  });
  await makeEvent(asha, { name: 'Tech Fest 2026', budgetPaise: 4_000_000 });

  const fee = (memberId: unknown, fields: Record<string, string> = {}, proof = false) =>
    postEntry(
      asha,
      freshers,
      {
        direction: 'in',
        mode: 'cash',
        amountPaise: '50000',
        memberId: String(memberId),
        ...fields,
      },
      proof ? placeholderPng() : null,
    ).expect(201);
  await fee(cast.member._id);
  const balaFee = await fee(cast.admin2._id, { mode: 'upi', txnId: '5120001' }, true);
  await verify(bala, balaFee.body.id, { outcome: 'confirmed' }).expect(201);
  await postEntry(asha, freshers, { txnId: '5120002' }).expect(201);

  const ask = async (text: string, sender: { _id: unknown } = cast.member) =>
    (await chat(asha, GROUP_CHAT, { text, senderId: sender._id }).expect(201))
      .body as BotMessageDTO[];
  return { cast, asha, ask };
}

describe('the bot in the class group', () => {
  it('stays quiet unless it is tagged', async () => {
    const s = await setup();
    const thread = await s.ask("who hasn't paid?");
    expect(thread).toHaveLength(1);
    expect(thread[0]).toMatchObject({
      from: 'person',
      sender: { name: 'Chitra Member' },
      text: "who hasn't paid?",
    });
  });

  it('lists who has not paid when tagged', async () => {
    const s = await setup();
    const text = lastBotText(await s.ask("@NoCap who hasn't paid for freshers?"));
    expect(text).toContain('*Freshers Party 2026*');
    expect(text).toContain('Paid: 1 of 3');
    expect(text).toContain('Waiting for confirmation: 1');
    expect(text).toContain('Not paid yet (1):\n• Asha Admin');
  });

  it('picks the newest event with a fee when the question names none', async () => {
    const s = await setup();
    expect(lastBotText(await s.ask('@NoCap unpaid?'))).toContain('Freshers Party 2026');
  });

  it('says so when the event has no fee', async () => {
    const s = await setup();
    expect(lastBotText(await s.ask('@NoCap who hasnt paid for tech fest'))).toBe(
      'Tech Fest 2026 has no member fee.',
    );
  });

  it('answers how much is left and how much was spent', async () => {
    const s = await setup();
    const left = lastBotText(await s.ask('@nocap how much is left for freshers?'));
    expect(left).toContain('Left in the budget: ₹23,800 of ₹25,000');
    expect(left).toContain('Collected: ₹1,000');

    const spent = lastBotText(await s.ask('@NoCap how much was spent on freshers'));
    expect(spent).toContain('Spent so far: ₹1,200 on 1 payment');
    expect(spent).toContain('Biggest: ₹1,200 to Decor Shop');
    expect(spent).toContain('Not verified yet: ₹1,200');
  });

  it('tells each person their own fee status', async () => {
    const s = await setup();
    expect(lastBotText(await s.ask('@NoCap my status'))).toContain(
      'Freshers Party 2026: ₹500 recorded, waiting for confirmation',
    );
    expect(lastBotText(await s.ask('@NoCap my status', s.cast.admin))).toContain(
      'Freshers Party 2026: not paid (₹500 due)',
    );
    expect(lastBotText(await s.ask('@NoCap have I paid?', s.cast.viewer))).toContain('viewer');
  });

  it('explains what it can answer when it does not understand', async () => {
    const s = await setup();
    const text = lastBotText(await s.ask('@NoCap what is the weather'));
    expect(text).toContain("Sorry, I didn't get that.");
    expect(text).toContain('@NoCap who hasn’t paid for freshers?');
  });

  it('asks for screenshots in a private chat, and ignores untagged images', async () => {
    const s = await setup();
    const quiet = await chat(s.asha, GROUP_CHAT, {
      senderId: s.cast.admin._id,
      image: placeholderPng(),
    }).expect(201);
    expect(quiet.body).toHaveLength(1);
    expect(quiet.body[0].imageUrl).toMatch(/^\/api\/proofs\//);

    const tagged = await chat(s.asha, GROUP_CHAT, {
      senderId: s.cast.admin._id,
      text: '@NoCap',
      image: placeholderPng(),
    }).expect(201);
    expect(lastBotText(tagged.body)).toContain('private chat');
  });

  it('tells numbers it does not know to ask an admin', async () => {
    const s = await setup();
    const deps = { uploadDir: ctx.uploadDir, parser: mockScreenshotParser };
    await handleMessage(
      { chat: { id: GROUP_CHAT, kind: 'group' }, sender: null, text: 'unpaid', mentionsBot: true },
      deps,
    );
    const thread = (await s.asha.get(`/api/sim/chats/${GROUP_CHAT}/messages`).expect(200))
      .body as BotMessageDTO[];
    expect(thread[0]?.sender).toBeUndefined();
    expect(lastBotText(thread)).toContain("isn't registered with NoCap");
  });
});
