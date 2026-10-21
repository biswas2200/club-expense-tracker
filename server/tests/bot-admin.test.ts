import { describe, expect, it } from 'vitest';
import type { ActivityDTO, BotMessageDTO, EntryDTO } from '@nocap/shared';
import {
  chat,
  createCast,
  dmOf,
  lastBotText,
  loginAs,
  makeEvent,
  placeholderPng,
  sampleShot,
  useTestApp,
} from './helpers';

const ctx = useTestApp();

const decorShot = () =>
  sampleShot({
    amountPaise: 120000,
    direction: 'out',
    counterparty: 'Decor Shop',
    txnId: '512014334210',
    paidAt: '2026-10-14T10:12:00.000Z',
  });

/** Asha (admin) in her private chat with the bot. Tech Fest is the newest event. */
async function setup() {
  const cast = await createCast();
  const asha = await loginAs(ctx.app, cast.admin._id);
  const freshers = await makeEvent(asha, {
    name: 'Freshers Party 2026',
    budgetPaise: 2_500_000,
    feePaise: 50_000,
  });
  const fest = await makeEvent(asha, { name: 'Tech Fest 2026', budgetPaise: 4_000_000 });

  const sendAs = async (person: { _id: unknown }, message: Parameters<typeof chat>[2]) =>
    (await chat(asha, dmOf(person), message).expect(201)).body as BotMessageDTO[];
  /** Sends a message from Asha and returns the bot's last reply. */
  const send = async (message: string | Parameters<typeof chat>[2]) =>
    lastBotText(
      await sendAs(cast.admin, typeof message === 'string' ? { text: message } : message),
    );
  const entries = async (eventId: string) =>
    (await asha.get(`/api/events/${eventId}/entries`).expect(200)).body as EntryDTO[];
  return { cast, asha, freshers, fest, send, sendAs, entries };
}

describe('recording a payment by chat', () => {
  it('reads a screenshot and asks before saving anything', async () => {
    const s = await setup();
    const reply = await s.send({ image: decorShot(), text: 'freshers' });
    expect(reply).toContain('₹1,200 paid to Decor Shop by UPI');
    expect(reply).toContain('UPI ref: 512014334210');
    expect(reply).toContain('Event: Freshers Party 2026');
    expect(reply).toContain('Date: 14 Oct 2026');
    expect(reply).toContain('Reply 1 to save, 2 to fix');
    expect(await s.entries(s.freshers)).toHaveLength(0);
  });

  it('saves the entry, with the screenshot as proof, when the admin replies 1', async () => {
    const s = await setup();
    await s.send({ image: decorShot(), text: 'freshers' });
    const reply = await s.send('1');
    expect(reply).toContain('Saved');
    expect(reply).toContain('Freshers Party 2026');

    const [entry] = await s.entries(s.freshers);
    expect(entry).toMatchObject({
      direction: 'out',
      mode: 'upi',
      amountPaise: 120000,
      counterparty: 'Decor Shop',
      txnId: '512014334210',
      occurredAt: '2026-10-14T00:00:00.000Z',
      source: 'chat',
      createdBy: { name: 'Asha Admin' },
    });
    expect(entry!.proofUrl).toMatch(/^\/api\/proofs\//);

    const activity = (await s.asha.get('/api/activity').expect(200)).body as ActivityDTO[];
    expect(activity[0]!.summary).toBe('Recorded ₹1,200 paid to Decor Shop by UPI, via chat');

    expect(await s.send('1')).toContain('nothing waiting to be saved');
    expect(await s.entries(s.freshers)).toHaveLength(1);
  });

  it('refuses a screenshot that is already in the ledger', async () => {
    const s = await setup();
    await s.send({ image: decorShot(), text: 'freshers' });
    await s.send('1');
    const reply = await s.send({ image: decorShot() });
    expect(reply).toContain('already recorded');
    expect(reply).toContain('Freshers Party 2026');
    expect(reply).toContain('Asha Admin');
    expect(await s.send('1')).toContain('nothing waiting to be saved');
    expect(await s.entries(s.freshers)).toHaveLength(1);
  });

  it('lets the admin fix the amount before saving', async () => {
    const s = await setup();
    await s.send({ image: decorShot(), text: 'freshers' });
    expect(await s.send('2')).toContain('1 Amount');
    expect(await s.send('1')).toContain('Send the right amount');
    expect(await s.send('abc')).toContain("doesn't look like an amount");
    expect(await s.send('1,500')).toContain('₹1,500 paid to Decor Shop');
    await s.send('1');
    expect((await s.entries(s.freshers))[0]!.amountPaise).toBe(150000);
  });

  it('lets the admin fix the name, the direction and the event', async () => {
    const s = await setup();
    await s.send({ image: decorShot(), text: 'freshers' });
    await s.send('2');
    await s.send('2');
    expect(await s.send('Party Decor Co')).toContain('paid to Party Decor Co');
    await s.send('2');
    expect(await s.send('3')).toContain('₹1,200 received from Party Decor Co');
    await s.send('2');
    const events = await s.send('4');
    expect(events).toContain('1 Tech Fest 2026');
    expect(events).toContain('2 Freshers Party 2026');
    expect(await s.send('1')).toContain('Event: Tech Fest 2026');
    await s.send('1');
    expect(await s.entries(s.fest)).toHaveLength(1);
    expect(await s.entries(s.freshers)).toHaveLength(0);
  });

  it('cancels without saving', async () => {
    const s = await setup();
    await s.send({ image: decorShot() });
    await s.send('2');
    expect(await s.send('5')).toBe('Cancelled. Nothing was saved.');
    expect(await s.send('1')).toContain('nothing waiting to be saved');

    await s.send({ image: decorShot() });
    expect(await s.send('cancel')).toBe('Cancelled. Nothing was saved.');
    expect(await s.entries(s.fest)).toHaveLength(0);
  });

  it('uses the newest event when the caption names none, then the last one used', async () => {
    const s = await setup();
    expect(await s.send({ image: decorShot() })).toContain('Event: Tech Fest 2026');
    await s.send('cancel');

    await s.send('cash out 200 to Tea stall for freshers');
    await s.send('1');
    expect(await s.send({ image: decorShot() })).toContain('Event: Freshers Party 2026');
  });

  it('asks for the details when it cannot read a screenshot', async () => {
    const s = await setup();
    expect(await s.send({ image: placeholderPng(), text: 'freshers' })).toContain("couldn't read");
    expect(await s.send('decor shop')).toContain('1200 to Decor Shop');
    const reply = await s.send('1200 to Decor Shop ref 99887766');
    expect(reply).toContain('₹1,200 paid to Decor Shop by UPI');
    expect(reply).toContain('UPI ref: 99887766');
    await s.send('1');
    const [entry] = await s.entries(s.freshers);
    expect(entry).toMatchObject({ mode: 'upi', txnId: '99887766', source: 'chat' });
    expect(entry!.proofUrl).toBeDefined();
  });

  it('records cash typed as a message and links club members by name', async () => {
    const s = await setup();
    const reply = await s.send('cash in 500 from chitra member for freshers');
    expect(reply).toContain('₹500 received from Chitra Member (club member) in cash');
    expect(reply).toContain('Event: Freshers Party 2026');
    expect(await s.send('1')).toContain('I’ve asked Chitra Member to confirm it');
    const [entry] = await s.entries(s.freshers);
    expect(entry).toMatchObject({
      mode: 'cash',
      member: { name: 'Chitra Member' },
      counterparty: 'Chitra Member',
    });
    expect(entry!.proofUrl).toBeUndefined();
  });

  it('answers a question while a payment waits, then still saves it', async () => {
    const s = await setup();
    await s.send({ image: decorShot(), text: 'freshers' });
    expect(await s.send('how much is left for freshers')).toContain('Left in the budget');
    expect(await s.send('1')).toContain('Saved');
  });

  it('saves once when "1" arrives twice at the same moment', async () => {
    const s = await setup();
    await s.send('cash out 200 to Tea stall for freshers');
    await Promise.all([s.send('1'), s.send('1')]);
    expect(await s.entries(s.freshers)).toHaveLength(1);
  });

  it('shows the help, with the cash format, to admins', async () => {
    const s = await setup();
    expect(await s.send('help')).toContain('cash in 500 from');
  });

  it('does not let members or viewers record payments', async () => {
    const s = await setup();
    for (const person of [s.cast.member, s.cast.viewer]) {
      const shot = lastBotText(await s.sendAs(person, { image: decorShot() }));
      expect(shot).toContain('Only committee members can record payments');
      const cash = lastBotText(await s.sendAs(person, { text: 'cash in 500 from Rahul' }));
      expect(cash).toContain('Only committee members can record payments');
    }
    expect(await s.entries(s.fest)).toHaveLength(0);
  });

  it('only reads screenshots and photos', async () => {
    const s = await setup();
    const pdf = Buffer.from('%PDF-1.4\n%fake\n');
    expect(await s.send({ image: pdf, imageType: 'application/pdf' })).toContain(
      'screenshot or photo',
    );
  });
});
