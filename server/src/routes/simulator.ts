import { Router, type RequestHandler } from 'express';
import { isValidObjectId } from 'mongoose';
import { z } from 'zod';
import type { SimChatDTO } from '@nocap/shared';
import {
  GROUP_CHAT_ID,
  GROUP_CHAT_TITLE,
  parseChatId,
  privateChatId,
  threadDTOs,
} from '../bot/chats';
import { handleMessage } from '../bot/engine';
import type { ScreenshotParser } from '../bot/parser';
import { HttpError, notFound } from '../lib/http';
import { proofUpload } from '../lib/uploads';
import { requireAuth } from '../middleware/auth';
import { BotChat } from '../models/BotChat';
import { BotMessage } from '../models/BotMessage';
import { BotPing } from '../models/BotPing';
import { Member } from '../models/Member';

const messageSchema = z.object({
  text: z.string().max(1000, 'Keep a message under 1,000 characters').optional(),
  senderId: z.string().optional(),
});

/** Every chat the simulator shows: the class group, then a private chat with each person. */
async function listChats(): Promise<SimChatDTO[]> {
  const people = await Member.find({}, { name: 1, role: 1 }).sort({ name: 1 }).lean();
  const last = await BotMessage.aggregate<{
    _id: string;
    from: 'person' | 'bot';
    text?: string;
    imagePath?: string;
    createdAt: Date;
  }>([
    { $sort: { createdAt: -1, _id: -1 } },
    {
      $group: {
        _id: '$chatId',
        from: { $first: '$from' },
        text: { $first: '$text' },
        imagePath: { $first: '$imagePath' },
        createdAt: { $first: '$createdAt' },
      },
    },
  ]);
  const lastByChat = new Map(
    last.map((m) => [
      m._id,
      {
        from: m.from,
        text: m.text ?? (m.imagePath ? 'Photo' : ''),
        createdAt: m.createdAt.toISOString(),
      },
    ]),
  );
  const askedPeople = new Set(
    (await BotPing.find({ open: true }, { memberId: 1 }).lean()).map((p) => String(p.memberId)),
  );
  const draftChats = new Set(
    (await BotChat.find({ step: { $exists: true } }, { chatId: 1 }).lean()).map((c) => c.chatId),
  );

  const chats: SimChatDTO[] = people.map((p) => {
    const id = privateChatId(p._id);
    return {
      id,
      kind: 'private',
      title: p.name,
      person: { id: String(p._id), name: p.name, role: p.role },
      lastMessage: lastByChat.get(id),
      awaitingReply: askedPeople.has(String(p._id)) || draftChats.has(id),
    };
  });
  // Chats waiting for an answer first, then the most recent, then by name.
  chats.sort(
    (a, b) =>
      Number(b.awaitingReply) - Number(a.awaitingReply) ||
      (b.lastMessage?.createdAt ?? '').localeCompare(a.lastMessage?.createdAt ?? '') ||
      a.title.localeCompare(b.title),
  );
  return [
    {
      id: GROUP_CHAT_ID,
      kind: 'group',
      title: GROUP_CHAT_TITLE,
      lastMessage: lastByChat.get(GROUP_CHAT_ID),
      awaitingReply: false,
    },
    ...chats,
  ];
}

/** The chat in the URL: the group, or a private chat with someone who exists. */
async function resolveChat(chatId: unknown) {
  const chat = typeof chatId === 'string' ? parseChatId(chatId) : undefined;
  if (!chat) throw notFound('Chat');
  if (chat.kind === 'private' && !(await Member.exists({ _id: chat.memberId }))) {
    throw notFound('Chat');
  }
  return { id: chatId as string, ...chat };
}

/**
 * The chat simulator: a WhatsApp-style test bench for the bot that runs in the browser.
 * Dev only, because it lets you write as anyone; v0.6 puts real WhatsApp in front of the
 * same engine.
 */
export function simulatorRouter(opts: { uploadDir: string; parser: ScreenshotParser }) {
  const router = Router();
  router.use(requireAuth);

  router.get('/chats', async (_req, res) => {
    res.json(await listChats());
  });

  router.get('/chats/:chatId/messages', async (req, res) => {
    const chat = await resolveChat(req.params.chatId);
    res.json(await threadDTOs(chat.id));
  });

  const chatExists: RequestHandler = async (req, _res, next) => {
    await resolveChat(req.params.chatId);
    next();
  };

  router.post('/chats/:chatId/messages', chatExists, proofUpload('image'), async (req, res) => {
    const chat = await resolveChat(req.params.chatId);
    const body = messageSchema.parse(req.body ?? {});
    const text = body.text?.trim() ?? '';
    if (!text && !req.file) throw new HttpError(400, 'Type a message or attach a screenshot');

    // In a private chat the person is fixed; in the group you choose who is writing.
    const senderId = chat.kind === 'private' ? chat.memberId : body.senderId;
    const sender = isValidObjectId(senderId) ? await Member.findById(senderId) : null;
    if (!sender) throw new HttpError(400, 'Choose who is sending the message');

    await handleMessage(
      {
        chat: { id: chat.id, kind: chat.kind },
        sender,
        text,
        image: req.file?.buffer,
        mentionsBot: /@nocap\b/i.test(text),
      },
      { uploadDir: opts.uploadDir, parser: opts.parser },
    );
    res.status(201).json(await threadDTOs(chat.id));
  });

  return router;
}
