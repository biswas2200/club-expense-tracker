import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { BotMessageDTO, SimChatDTO } from '@nocap/shared';
import { createApp } from '../src/app';
import {
  chat,
  createCast,
  dmOf,
  GROUP_CHAT,
  loginAs,
  makeEvent,
  placeholderPng,
  postEntry,
  useTestApp,
} from './helpers';

const ctx = useTestApp();

describe('chat simulator API', () => {
  it('does not exist when dev tools are off', async () => {
    const app = createApp({ uploadDir: ctx.uploadDir, sessionSecret: 's', devLogin: false });
    await request(app).get('/api/sim/chats').expect(404);
  });

  it('needs a login', async () => {
    await request(ctx.app).get('/api/sim/chats').expect(401);
  });

  it('lists the class group first, then a private chat for each person', async () => {
    const cast = await createCast();
    const admin = await loginAs(ctx.app, cast.admin._id);
    const eventId = await makeEvent(admin);
    await postEntry(
      admin,
      eventId,
      { direction: 'in', mode: 'cash', memberId: String(cast.member._id) },
      null,
    ).expect(201);

    const chats = (await admin.get('/api/sim/chats').expect(200)).body as SimChatDTO[];
    expect(chats[0]).toMatchObject({
      id: GROUP_CHAT,
      kind: 'group',
      title: 'Sparks class group',
      awaitingReply: false,
    });
    expect(
      chats
        .slice(1)
        .map((c) => c.title)
        .sort(),
    ).toEqual(['Asha Admin', 'Bala Admin', 'Chitra Member', 'Dev Viewer']);
    const chitra = chats.find((c) => c.id === dmOf(cast.member))!;
    expect(chitra).toMatchObject({
      kind: 'private',
      person: { name: 'Chitra Member', role: 'member' },
      awaitingReply: true,
      lastMessage: { from: 'bot' },
    });
    // People with something waiting come right after the group.
    expect(chats[1]!.id).toBe(dmOf(cast.member));
  });

  it('returns a thread oldest first, with senders and images', async () => {
    const cast = await createCast();
    const admin = await loginAs(ctx.app, cast.admin._id);
    await chat(admin, GROUP_CHAT, { text: 'hello all', senderId: cast.member._id }).expect(201);
    await chat(admin, GROUP_CHAT, { image: placeholderPng(), senderId: cast.admin._id }).expect(
      201,
    );
    const thread = (await admin.get(`/api/sim/chats/${GROUP_CHAT}/messages`).expect(200))
      .body as BotMessageDTO[];
    expect(thread.map((m) => m.sender?.name)).toEqual(['Chitra Member', 'Asha Admin']);
    expect(thread[1]!.imageUrl).toMatch(/^\/api\/proofs\/[0-9a-f-]{36}\.png$/);
    await admin.get(thread[1]!.imageUrl!).expect(200);
  });

  it('checks the chat, the sender and the message', async () => {
    const cast = await createCast();
    const admin = await loginAs(ctx.app, cast.admin._id);
    await admin.get('/api/sim/chats/dm-nope/messages').expect(404);
    await admin.get(`/api/sim/chats/dm-${'0'.repeat(24)}/messages`).expect(404);
    await chat(admin, 'dm-nope', { text: 'hi' }).expect(404);

    const noSender = await chat(admin, GROUP_CHAT, { text: 'hi' }).expect(400);
    expect(noSender.body.error).toBe('Choose who is sending the message');
    const empty = await chat(admin, dmOf(cast.member), { text: '  ' }).expect(400);
    expect(empty.body.error).toBe('Type a message or attach a screenshot');
    await chat(admin, dmOf(cast.member), { text: 'x'.repeat(1001) }).expect(400);
  });
});
