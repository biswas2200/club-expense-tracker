import { describe, expect, it } from 'vitest';
import type { ActivityDTO, BotMessageDTO, EntryDTO, SimChatDTO } from '@nocap/shared';
import {
  chat,
  createCast,
  dmOf,
  lastBotText,
  loginAs,
  makeEvent,
  postEntry,
  useTestApp,
  verify,
} from './helpers';

const ctx = useTestApp();

async function setup() {
  const cast = await createCast();
  const asha = await loginAs(ctx.app, cast.admin._id);
  const chitra = await loginAs(ctx.app, cast.member._id);
  const eventId = await makeEvent(asha, { feePaise: 50_000 });

  /** Cash from Chitra recorded by Asha in the web app, on 14 Oct. */
  const pay = async (fields: Record<string, string> = {}) =>
    (
      await postEntry(
        asha,
        eventId,
        {
          direction: 'in',
          mode: 'cash',
          amountPaise: '50000',
          memberId: String(cast.member._id),
          ...fields,
        },
        null,
      ).expect(201)
    ).body as EntryDTO;
  const thread = async (person: { _id: unknown }) =>
    (await asha.get(`/api/sim/chats/${dmOf(person)}/messages`).expect(200)).body as BotMessageDTO[];
  const reply = async (person: { _id: unknown }, text: string) =>
    lastBotText((await chat(asha, dmOf(person), { text }).expect(201)).body);
  const entries = async () =>
    (await asha.get(`/api/events/${eventId}/entries`).expect(200)).body as EntryDTO[];
  const waiting = async (person: { _id: unknown }) => {
    const chats = (await asha.get('/api/sim/chats').expect(200)).body as SimChatDTO[];
    return chats.find((c) => c.id === dmOf(person))!.awaitingReply;
  };
  return { cast, asha, chitra, eventId, pay, thread, reply, entries, waiting };
}

describe('verification pings', () => {
  it('asks the member to confirm a payment recorded for them', async () => {
    const s = await setup();
    await s.pay();
    expect(lastBotText(await s.thread(s.cast.member))).toBe(
      'Hi Chitra, Asha Admin recorded that you paid ₹500 in cash for Freshers on 14 Oct. ' +
        'Is that right? Reply YES or NO.',
    );
    expect(await s.waiting(s.cast.member)).toBe(true);
  });

  it('verifies the entry when the member replies yes', async () => {
    const s = await setup();
    await s.pay();
    expect(await s.reply(s.cast.member, 'Yes')).toContain('Thanks, Chitra');
    const [entry] = await s.entries();
    expect(entry!.verification).toMatchObject({
      state: 'verified',
      by: { name: 'Chitra Member' },
    });
    expect(await s.waiting(s.cast.member)).toBe(false);
    const activity = (await s.asha.get('/api/activity').expect(200)).body as ActivityDTO[];
    expect(activity[0]!.summary).toBe('Confirmed ₹500 received from Chitra Member via chat');
  });

  it('asks what is wrong after a no, and keeps the answer as the dispute note', async () => {
    const s = await setup();
    await s.pay();
    expect(await s.reply(s.cast.member, 'no')).toContain('What’s wrong?');
    expect(await s.waiting(s.cast.member)).toBe(true);
    expect(await s.reply(s.cast.member, 'I paid ₹300, not ₹500')).toContain('disputed');
    const [entry] = await s.entries();
    expect(entry!.verification).toMatchObject({
      state: 'disputed',
      note: 'I paid ₹300, not ₹500',
    });
  });

  it('asks about one payment at a time', async () => {
    const s = await setup();
    await s.pay();
    await s.pay({ amountPaise: '30000' });
    const pings = (await s.thread(s.cast.member)).filter((m) => m.from === 'bot');
    expect(pings).toHaveLength(1);
    expect(pings[0]!.text).toContain('₹500');

    await s.reply(s.cast.member, 'yes');
    expect(lastBotText(await s.thread(s.cast.member))).toContain('₹300');
    await s.reply(s.cast.member, 'yes');
    expect((await s.entries()).map((e) => e.verification.state)).toEqual(['verified', 'verified']);
  });

  it('stops waiting when the member answers in the app instead', async () => {
    const s = await setup();
    const entry = await s.pay();
    await verify(s.chitra, entry.id, { outcome: 'confirmed' }).expect(201);
    expect(await s.waiting(s.cast.member)).toBe(false);
    expect(await s.reply(s.cast.member, 'yes')).toContain('nothing waiting for your answer');
  });

  it('asks whoever paid on the member’s behalf', async () => {
    const s = await setup();
    await s.pay({ paidByMemberId: String(s.cast.admin2._id) });
    expect(lastBotText(await s.thread(s.cast.admin2))).toContain(
      'Asha Admin recorded that you paid ₹500 for Chitra Member in cash',
    );
    expect(await s.thread(s.cast.member)).toHaveLength(0);
  });

  it('asks a member who was paid by the club', async () => {
    const s = await setup();
    await s.pay({ direction: 'out' });
    expect(lastBotText(await s.thread(s.cast.member))).toContain(
      'recorded that the club paid you ₹500 in cash for Freshers',
    );
  });

  it('does not ask the person who recorded the entry', async () => {
    const s = await setup();
    await s.pay({ memberId: String(s.cast.admin._id) });
    expect(await s.thread(s.cast.admin)).toHaveLength(0);
  });

  it('asks again about the new amount after a correction', async () => {
    const s = await setup();
    const first = await s.pay();
    await postEntry(
      s.asha,
      s.eventId,
      {
        direction: 'in',
        mode: 'cash',
        amountPaise: '30000',
        memberId: String(s.cast.member._id),
        correctsEntryId: first.id,
        reason: 'Paid ₹300 so far',
      },
      null,
    ).expect(201);
    expect(lastBotText(await s.thread(s.cast.member))).toContain('₹300');
    await s.reply(s.cast.member, 'yes');
    const active = (await s.entries()).find((e) => e.status === 'active')!;
    expect(active.verification.state).toBe('verified');
  });

  it('says so when a yes or no arrives with nothing to answer', async () => {
    const s = await setup();
    expect(await s.reply(s.cast.member, 'yes')).toContain('nothing waiting for your answer');
  });
});
