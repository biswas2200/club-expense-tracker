import { model, Schema, type InferSchemaType } from 'mongoose';

export const PING_STATUSES = ['queued', 'asked', 'awaiting-note', 'answered', 'dropped'] as const;

/**
 * The bot asking a member "did you pay this?". A member gets one question at a time; the rest
 * wait in the queue. dropped: the entry was corrected, or answered in the app, before the
 * member replied.
 */
const botPingSchema = new Schema(
  {
    entryId: { type: Schema.Types.ObjectId, ref: 'LedgerEntry', required: true, unique: true },
    memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
    status: { type: String, enum: PING_STATUSES, required: true },
    /** Set only while the question is open, so the unique index allows one open ping each. */
    open: { type: Boolean },
    askedAt: { type: Date },
    answeredAt: { type: Date },
  },
  { timestamps: true },
);

botPingSchema.index({ memberId: 1, status: 1, createdAt: 1 });
botPingSchema.index({ memberId: 1 }, { unique: true, partialFilterExpression: { open: true } });

export type BotPingFields = InferSchemaType<typeof botPingSchema>;

export const BotPing = model('BotPing', botPingSchema, 'bot_pings');
