import { model, Schema, type InferSchemaType } from 'mongoose';
import { DIRECTIONS, ENTRY_SOURCES, MODES } from '@nocap/shared';
import { makeAppendOnly } from '../lib/appendOnly';

const ledgerEntrySchema = new Schema(
  {
    eventId: { type: Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
    direction: { type: String, enum: DIRECTIONS, required: true },
    mode: { type: String, enum: MODES, required: true },
    amountPaise: { type: Number, required: true, min: 0, validate: Number.isInteger },
    counterparty: { type: String, required: true, trim: true, maxlength: 120 },
    occurredAt: { type: Date, required: true },
    txnId: { type: String, trim: true, maxlength: 64 },
    note: { type: String, trim: true, maxlength: 500 },
    /** File name inside the upload folder. UPI entries always have one; cash may not. */
    proofPath: { type: String },
    /** The club member who paid (money in) or was paid (money out). */
    memberId: { type: Schema.Types.ObjectId, ref: 'Member', index: true },
    /** Set when someone else paid on the member's behalf. */
    paidByMemberId: { type: Schema.Types.ObjectId, ref: 'Member', index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
    /** Set on a correction: the entry it replaces. */
    correctsEntryId: { type: Schema.Types.ObjectId, ref: 'LedgerEntry' },
    reason: { type: String, trim: true, maxlength: 300 },
    /** Where it was recorded: the web app or a chat with the bot. */
    source: { type: String, enum: ENTRY_SOURCES, default: 'web' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// An entry can be corrected only once; the next fix must correct the correction. The unique
// index also closes the race where two admins correct the same entry at the same moment.
ledgerEntrySchema.index(
  { correctsEntryId: 1 },
  { unique: true, partialFilterExpression: { correctsEntryId: { $exists: true } } },
);

// Duplicate UPI payments are looked up by transaction ID.
ledgerEntrySchema.index({ txnId: 1 }, { partialFilterExpression: { txnId: { $exists: true } } });

makeAppendOnly(
  ledgerEntrySchema,
  'Ledger entries',
  'add a correction instead of changing or deleting an entry',
);

export type LedgerEntryFields = InferSchemaType<typeof ledgerEntrySchema>;

export const LedgerEntry = model('LedgerEntry', ledgerEntrySchema, 'ledger_entries');
