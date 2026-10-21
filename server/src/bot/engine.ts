/**
 * The bot: one message in, the bot's replies written into the chat log. It doesn't know about
 * WhatsApp; the chat simulator calls it now and the WhatsApp relay will in v0.6.
 *
 * Behaviour depends on who writes and where:
 * - class group: answers read-only questions, and only when tagged;
 * - private chat with an admin: also records payments from screenshots and cash messages;
 * - private chat with anyone: answers the bot's "did you pay this?" questions.
 */
import { Types } from 'mongoose';
import type { ChatKind } from '@nocap/shared';
import { detectProofType } from '../lib/fileType';
import { HttpError } from '../lib/http';
import { BotMessage } from '../models/BotMessage';
import { BotPing } from '../models/BotPing';
import type { MemberDoc } from '../models/Member';
import { saveProof } from '../services/entries';
import { eventFees } from '../services/fees';
import { listEntryDTOs, listEventDTOs } from '../services/ledger';
import { verifyEntry } from '../services/verification';
import { say } from './chats';
import { continueDraft, startDraft } from './drafts';
import { isNo, isYes, matchEvent, matchIntent, parseCashCommand } from './intents';
import type { ScreenshotParser } from './parser';
import { askNext, closePing, openPingOf } from './pingQueue';
import {
  ALREADY_ANSWERED,
  ASK_WHATS_WRONG,
  helpReply,
  IMAGES_ONLY,
  myStatusReply,
  NO_EVENTS,
  NOT_REGISTERED,
  NOTHING_TO_ANSWER,
  notUnderstood,
  ONLY_ADMINS,
  PRIVATE_ONLY,
  remainingReply,
  spentReply,
  thanksConfirmed,
  thanksDisputed,
  unpaidReply,
  viewerStatusReply,
  type MyFee,
} from './replies';

export interface IncomingMessage {
  chat: { id: string; kind: ChatKind };
  /** null: a number that isn't registered with NoCap */
  sender: MemberDoc | null;
  text?: string;
  image?: Buffer;
  /** the bot was tagged (only matters in the group) */
  mentionsBot: boolean;
}

export interface BotDeps {
  uploadDir: string;
  parser: ScreenshotParser;
}

type Mode = 'group' | 'admin' | 'member';

/** Answers a read-only question from fixed templates, or undefined if it isn't one. */
async function answerQuestion(text: string, sender: MemberDoc, mode: Mode) {
  const intent = matchIntent(text);
  if (!intent) return undefined;
  if (intent === 'help') return helpReply(mode);

  const events = await listEventDTOs(); // newest first
  const named = matchEvent(text, events);

  if (intent === 'my-status') {
    if (sender.role === 'viewer') return viewerStatusReply(sender.name);
    const fees: MyFee[] = [];
    for (const event of named ? [named] : events.filter((e) => e.feePaise > 0)) {
      const all = await eventFees({ _id: new Types.ObjectId(event.id), feePaise: event.feePaise });
      const mine = all.rows.find((r) => r.member.id === String(sender._id));
      if (mine) {
        fees.push({ eventName: event.name, feePaise: all.feePaise, ...mine });
      }
    }
    return myStatusReply(sender.name, fees);
  }

  if (events.length === 0) return NO_EVENTS;
  if (intent === 'unpaid') {
    const event = named ?? events.find((e) => e.feePaise > 0) ?? events[0]!;
    const fees = await eventFees({ _id: new Types.ObjectId(event.id), feePaise: event.feePaise });
    return unpaidReply(event.name, fees);
  }
  const event = named ?? events[0]!;
  if (intent === 'remaining') return remainingReply(event);
  return spentReply(event, await listEntryDTOs(event.id));
}

/** Records the member's answer to the question the bot asked, then asks the next one. */
async function answerPing(
  chatId: string,
  sender: MemberDoc,
  entryId: Types.ObjectId,
  deps: BotDeps,
  answer: { outcome: 'confirmed' } | { outcome: 'disputed'; note: string },
) {
  // Close first, so the thanks lands before the next question.
  await closePing(entryId, 'answered');
  try {
    await verifyEntry({
      entryId: String(entryId),
      actor: sender,
      body: answer.outcome === 'disputed' ? { ...answer, note: answer.note.slice(0, 300) } : answer,
      uploadDir: deps.uploadDir,
      channel: 'chat',
    });
    await say(
      chatId,
      answer.outcome === 'confirmed' ? thanksConfirmed(sender.name) : thanksDisputed(sender.name),
    );
  } catch (err) {
    if (!(err instanceof HttpError)) throw err;
    await say(
      chatId,
      err.status === 409 ? ALREADY_ANSWERED : `I couldn't record that. ${err.message}.`,
    );
  }
  await askNext(sender._id);
}

async function handlePrivate(
  msg: IncomingMessage,
  sender: MemberDoc,
  text: string,
  imagePath: string | undefined,
  deps: BotDeps,
) {
  const chatId = msg.chat.id;
  const isAdmin = sender.role === 'admin';
  const mode: Mode = isAdmin ? 'admin' : 'member';

  const ping = !msg.image && text ? await openPingOf(sender._id) : null;
  if (ping?.status === 'awaiting-note') {
    return answerPing(chatId, sender, ping.entryId, deps, { outcome: 'disputed', note: text });
  }
  if (ping && isYes(text)) {
    return answerPing(chatId, sender, ping.entryId, deps, { outcome: 'confirmed' });
  }
  if (ping && isNo(text)) {
    await BotPing.updateOne({ _id: ping._id, status: 'asked' }, { status: 'awaiting-note' });
    return say(chatId, ASK_WHATS_WRONG);
  }

  const draftCtx = { chatId, actor: sender, uploadDir: deps.uploadDir };
  if (isAdmin && !msg.image && (await continueDraft(draftCtx, text))) return;
  if (isYes(text) || isNo(text)) return say(chatId, NOTHING_TO_ANSWER);

  if (msg.image) {
    if (!isAdmin) return say(chatId, ONLY_ADMINS);
    if (!imagePath) return say(chatId, IMAGES_ONLY);
    const parsed = await deps.parser.parse(msg.image);
    return startDraft(
      draftCtx,
      { mode: 'upi', direction: 'out', ...parsed, proofPath: imagePath },
      text || undefined,
    );
  }

  const cash = parseCashCommand(text);
  if (cash) {
    if (!isAdmin) return say(chatId, ONLY_ADMINS);
    const { eventHint, ...fields } = cash;
    return startDraft(draftCtx, { ...fields, mode: 'cash' }, eventHint, { hintIsName: true });
  }

  return say(chatId, (await answerQuestion(text, sender, mode)) ?? notUnderstood(mode));
}

/** Handles one incoming message and writes it, and the bot's replies, to the chat log. */
export async function handleMessage(msg: IncomingMessage, deps: BotDeps) {
  // Only screenshots and photos are kept: a PDF or anything else is never shown in a chat.
  const type = msg.image ? detectProofType(msg.image) : null;
  const imagePath =
    msg.image && type && type.ext !== 'pdf'
      ? await saveProof({ buffer: msg.image }, deps.uploadDir)
      : undefined;
  const text = msg.text?.trim() ?? '';
  await BotMessage.create({
    chatId: msg.chat.id,
    from: 'person',
    senderId: msg.sender?._id,
    text: text || (msg.image && !imagePath ? '(an attachment)' : undefined),
    imagePath,
  });

  // Mentions aren't part of the question: "@NoCap who hasn't paid?"
  const question = text.replace(/@\S+/g, ' ').replace(/\s+/g, ' ').trim();
  const { sender, chat } = msg;

  if (chat.kind === 'group') {
    if (!msg.mentionsBot) return;
    if (!sender) return say(chat.id, NOT_REGISTERED);
    if (msg.image) return say(chat.id, PRIVATE_ONLY);
    return say(
      chat.id,
      (await answerQuestion(question, sender, 'group')) ?? notUnderstood('group'),
    );
  }
  if (!sender) return say(chat.id, NOT_REGISTERED);
  return handlePrivate(msg, sender, question, imagePath, deps);
}
