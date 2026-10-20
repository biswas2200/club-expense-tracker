import { model, Schema, type InferSchemaType } from 'mongoose';
import { DIRECTIONS, MODES } from '@nocap/shared';

export class AppendOnlyError extends Error {
  constructor() {
    super(
      'Ledger entries are append-only: add a correction instead of changing or deleting an entry',
    );
  }
}

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
    /** File name inside the upload folder. */
    proofPath: { type: String, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
    /** Set on a correction: the entry it replaces. */
    correctsEntryId: { type: Schema.Types.ObjectId, ref: 'LedgerEntry' },
    reason: { type: String, trim: true, maxlength: 300 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// An entry can be corrected only once; the next fix must correct the correction. The unique
// index also closes the race where two admins correct the same entry at the same moment.
ledgerEntrySchema.index(
  { correctsEntryId: 1 },
  { unique: true, partialFilterExpression: { correctsEntryId: { $exists: true } } },
);

// Append-only guard: every Mongoose path that could change or remove a stored entry throws.
// (Raw driver calls bypass this; v1.0-beta adds a MongoDB role without update/delete rights.)
const refuse = async () => {
  throw new AppendOnlyError();
};
ledgerEntrySchema.pre(
  [
    'updateOne',
    'updateMany',
    'findOneAndUpdate',
    'replaceOne',
    'findOneAndReplace',
    'deleteOne',
    'deleteMany',
    'findOneAndDelete',
  ],
  { document: false, query: true },
  refuse,
);
ledgerEntrySchema.pre(['updateOne', 'deleteOne'], { document: true, query: false }, refuse);
ledgerEntrySchema.pre('save', async function () {
  if (!this.isNew) throw new AppendOnlyError();
});

export type LedgerEntryFields = InferSchemaType<typeof ledgerEntrySchema>;

export const LedgerEntry = model('LedgerEntry', ledgerEntrySchema, 'ledger_entries');
