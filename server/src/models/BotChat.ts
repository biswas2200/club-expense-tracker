import { model, Schema, type InferSchemaType } from 'mongoose';
import { DIRECTIONS, MODES } from '@nocap/shared';

export const DRAFT_STEPS = [
  'confirm',
  'fix-menu',
  'fix-amount',
  'fix-name',
  'fix-event',
  'details',
] as const;
export type DraftStep = (typeof DRAFT_STEPS)[number];

/** A payment an admin is recording by chat, before they reply 1 to save it. */
const draftSchema = new Schema(
  {
    /** Changes with every new draft, so a late "1" can't save a draft that was replaced. */
    key: { type: String, required: true },
    eventId: { type: Schema.Types.ObjectId, ref: 'Event', required: true },
    direction: { type: String, enum: DIRECTIONS, required: true },
    mode: { type: String, enum: MODES, required: true },
    amountPaise: { type: Number },
    counterparty: { type: String },
    memberId: { type: Schema.Types.ObjectId, ref: 'Member' },
    txnId: { type: String },
    occurredAt: { type: Date, required: true },
    /** The screenshot, already in the upload folder; it becomes the entry's proof. */
    proofPath: { type: String },
  },
  { _id: false },
);

/**
 * Where each chat's conversation is up to. It lives in MongoDB, not in server memory, so any
 * API copy can carry on a conversation another copy started.
 */
const botChatSchema = new Schema(
  {
    chatId: { type: String, required: true, unique: true, maxlength: 80 },
    draft: { type: draftSchema },
    step: { type: String, enum: DRAFT_STEPS },
    /** The event of the last payment saved from this chat: the default for the next one. */
    lastEventId: { type: Schema.Types.ObjectId, ref: 'Event' },
  },
  { timestamps: true },
);

export type BotChatFields = InferSchemaType<typeof botChatSchema>;
export type Draft = InferSchemaType<typeof draftSchema>;

export const BotChat = model('BotChat', botChatSchema, 'bot_chats');
