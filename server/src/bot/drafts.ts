/**
 * An admin recording a payment by chat: a screenshot or a "cash in/out" message becomes a
 * draft, the bot reads it back, and nothing is saved until the admin replies 1.
 */
import { randomUUID } from 'node:crypto';
import { Types } from 'mongoose';
import { ZodError } from 'zod';
import { parseRupees, type Direction, type Mode } from '@nocap/shared';
import { HttpError } from '../lib/http';
import { BotChat, type Draft, type DraftStep } from '../models/BotChat';
import { Event } from '../models/Event';
import type { MemberDoc } from '../models/Member';
import { describeEntry } from '../services/audit';
import { createEntry, findDuplicatePayment } from '../services/entries';
import { findClubMemberByName, namesFor } from '../services/people';
import { say } from './chats';
import { matchEvent, parseDetails } from './intents';
import {
  ASK_AMOUNT,
  ASK_DETAILS,
  ASK_NAME,
  BAD_AMOUNT,
  CANCELLED,
  draftReply,
  duplicateReply,
  FIX_MENU,
  NO_EVENTS,
  NOTHING_TO_SAVE,
  pickEventReply,
  savedReply,
} from './replies';

/** Dates on payments are the club's local date: India. */
const CLUB_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' });
const clubDay = (at: Date) => new Date(`${CLUB_DATE.format(at)}T00:00:00.000Z`);
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

const isCancel = (text: string) => /^(cancel|stop)$/i.test(text.trim());

/** Events newest first, as the bot lists them. */
const eventsNewestFirst = () =>
  Event.find({}, { name: 1 }).sort({ createdAt: -1, _id: -1 }).limit(9).lean();

interface DraftContext {
  chatId: string;
  actor: MemberDoc;
  uploadDir: string;
}

async function showDraft(chatId: string, draft: Draft) {
  const event = await Event.findById(draft.eventId, { name: 1 }).lean();
  await say(
    chatId,
    draftReply({
      amountPaise: draft.amountPaise!,
      direction: draft.direction,
      counterparty: draft.counterparty!,
      mode: draft.mode,
      isMember: Boolean(draft.memberId),
      txnId: draft.txnId ?? undefined,
      occurredAt: draft.occurredAt,
      eventName: event?.name ?? 'an event',
    }),
  );
}

async function setDraft(chatId: string, draft: Draft | undefined, step: DraftStep | undefined) {
  if (!draft || !step) {
    await BotChat.updateOne({ chatId }, { $unset: { draft: 1, step: 1 } });
    return;
  }
  await BotChat.updateOne({ chatId }, { $set: { draft, step } }, { upsert: true });
}

/** A club member's exact name links the payment to them, so they get asked to confirm it. */
async function withCounterparty(draft: Draft, name: string): Promise<Draft> {
  const member = await findClubMemberByName(name);
  return member
    ? { ...draft, counterparty: member.name, memberId: member._id }
    : { ...draft, counterparty: name.trim().slice(0, 120), memberId: undefined };
}

/** Warns before a draft is made from a payment that is already in the ledger. */
async function refuseDuplicate(chatId: string, txnId: string | undefined) {
  const duplicate = txnId ? await findDuplicatePayment(txnId) : undefined;
  if (!duplicate) return false;
  const event = await Event.findById(duplicate.eventId, { name: 1 }).lean();
  const names = await namesFor([duplicate.createdBy]);
  await say(
    chatId,
    duplicateReply({
      txnId: txnId!,
      description: describeEntry(duplicate),
      eventName: event?.name ?? 'another event',
      recordedBy: names.get(String(duplicate.createdBy)) ?? 'an admin',
    }),
  );
  return true;
}

/**
 * Starts a new draft. The event is the one the hint names, else the one this chat used
 * last, else the newest. An unknown "for …" belongs to the name ("Food for Thought").
 */
export async function startDraft(
  ctx: DraftContext,
  fields: {
    direction: Direction;
    mode: Mode;
    amountPaise?: number;
    counterparty?: string;
    txnId?: string;
    paidAt?: Date;
    proofPath?: string;
  },
  hint: string | undefined,
  options: { hintIsName?: boolean } = {},
) {
  const events = await eventsNewestFirst();
  if (events.length === 0) return say(ctx.chatId, NO_EVENTS);
  if (await refuseDuplicate(ctx.chatId, fields.txnId)) return;

  const chat = await BotChat.findOne({ chatId: ctx.chatId }, { lastEventId: 1 }).lean();
  const named = hint ? matchEvent(hint, events) : undefined;
  const event = named ?? events.find((e) => chat?.lastEventId?.equals(e._id)) ?? events[0]!;
  let counterparty = fields.counterparty;
  if (hint && !named && options.hintIsName && counterparty) counterparty += ` for ${hint}`;

  let draft: Draft = {
    key: randomUUID(),
    eventId: event._id,
    direction: fields.direction,
    mode: fields.mode,
    amountPaise: fields.amountPaise,
    txnId: fields.txnId,
    occurredAt: clubDay(fields.paidAt ?? new Date()),
    proofPath: fields.proofPath,
  };
  if (counterparty) draft = await withCounterparty(draft, counterparty);

  if (draft.amountPaise && draft.counterparty) {
    await setDraft(ctx.chatId, draft, 'confirm');
    await showDraft(ctx.chatId, draft);
  } else {
    await setDraft(ctx.chatId, draft, 'details');
    await say(ctx.chatId, ASK_DETAILS);
  }
}

async function save(ctx: DraftContext, key: string) {
  // Claim the draft atomically: of two "1"s arriving together, only one saves.
  const chat = await BotChat.findOneAndUpdate(
    { chatId: ctx.chatId, step: 'confirm', 'draft.key': key },
    { $unset: { draft: 1, step: 1 } },
  ).lean();
  const draft = chat?.draft;
  if (!draft) return say(ctx.chatId, NOTHING_TO_SAVE);

  try {
    const entry = await createEntry({
      eventId: draft.eventId,
      body: {
        direction: draft.direction,
        mode: draft.mode,
        amountPaise: String(draft.amountPaise),
        counterparty: draft.counterparty,
        occurredAt: isoDay(draft.occurredAt),
        ...(draft.txnId ? { txnId: draft.txnId } : {}),
        ...(draft.memberId ? { memberId: String(draft.memberId) } : {}),
      },
      member: ctx.actor,
      uploadDir: ctx.uploadDir,
      savedProof: draft.proofPath ?? undefined,
      source: 'chat',
    });
    await BotChat.updateOne({ chatId: ctx.chatId }, { lastEventId: draft.eventId });
    const event = await Event.findById(draft.eventId, { name: 1 }).lean();
    await say(
      ctx.chatId,
      savedReply(event?.name ?? 'the event', entry.verification.confirmer?.name),
    );
  } catch (err) {
    const reason =
      err instanceof HttpError
        ? err.message
        : err instanceof ZodError
          ? err.issues[0]?.message
          : undefined;
    if (!reason) throw err;
    await say(ctx.chatId, `I couldn't save it. ${reason}.`.replace(/\.\.$/, '.'));
  }
}

/**
 * Handles a reply while a draft is open. Returns false when the message isn't about the
 * draft (a question, say), so the engine can answer it and keep the draft.
 */
export async function continueDraft(ctx: DraftContext, text: string): Promise<boolean> {
  const chat = await BotChat.findOne({ chatId: ctx.chatId }).lean();
  const draft = chat?.draft;
  const step = chat?.step;
  const reply = text.trim();

  if (!draft || !step) {
    if (reply === '1' || reply === '2') {
      await say(ctx.chatId, NOTHING_TO_SAVE);
      return true;
    }
    return false;
  }
  if (isCancel(reply)) {
    await setDraft(ctx.chatId, undefined, undefined);
    await say(ctx.chatId, CANCELLED);
    return true;
  }

  const confirm = async (next: Draft) => {
    await setDraft(ctx.chatId, next, 'confirm');
    await showDraft(ctx.chatId, next);
  };

  switch (step) {
    case 'confirm':
      if (reply === '1') await save(ctx, draft.key);
      else if (reply === '2') {
        await setDraft(ctx.chatId, draft, 'fix-menu');
        await say(ctx.chatId, FIX_MENU);
      } else return false;
      return true;

    case 'fix-menu':
      if (reply === '1') {
        await setDraft(ctx.chatId, draft, 'fix-amount');
        await say(ctx.chatId, ASK_AMOUNT);
      } else if (reply === '2') {
        await setDraft(ctx.chatId, draft, 'fix-name');
        await say(ctx.chatId, ASK_NAME);
      } else if (reply === '3') {
        await confirm({ ...draft, direction: draft.direction === 'in' ? 'out' : 'in' });
      } else if (reply === '4') {
        await setDraft(ctx.chatId, draft, 'fix-event');
        await say(ctx.chatId, pickEventReply((await eventsNewestFirst()).map((e) => e.name)));
      } else if (reply === '5') {
        await setDraft(ctx.chatId, undefined, undefined);
        await say(ctx.chatId, CANCELLED);
      } else {
        await say(ctx.chatId, FIX_MENU);
      }
      return true;

    case 'fix-amount': {
      const paise = parseRupees(reply.replace(/^(₹|rs\.?)\s*/i, ''));
      if (!paise) await say(ctx.chatId, BAD_AMOUNT);
      else await confirm({ ...draft, amountPaise: paise });
      return true;
    }

    case 'fix-name':
      if (!reply) await say(ctx.chatId, ASK_NAME);
      else await confirm(await withCounterparty(draft, reply));
      return true;

    case 'fix-event': {
      const events = await eventsNewestFirst();
      const picked = /^\d$/.test(reply) ? events[Number(reply) - 1] : undefined;
      if (!picked) await say(ctx.chatId, pickEventReply(events.map((e) => e.name)));
      else await confirm({ ...draft, eventId: new Types.ObjectId(String(picked._id)) });
      return true;
    }

    case 'details': {
      const details = parseDetails(reply);
      if (!details) {
        await say(ctx.chatId, ASK_DETAILS);
        return true;
      }
      if (await refuseDuplicate(ctx.chatId, details.txnId)) return true;
      await confirm(
        await withCounterparty(
          {
            ...draft,
            direction: details.direction,
            amountPaise: details.amountPaise,
            txnId: details.txnId ?? draft.txnId,
          },
          details.counterparty,
        ),
      );
      return true;
    }
  }
}
