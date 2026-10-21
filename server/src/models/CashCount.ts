import { model, Schema, type InferSchemaType } from 'mongoose';
import { makeAppendOnly } from '../lib/appendOnly';

/** A physical count of the cash box, with what the ledger expected at that moment. */
const cashCountSchema = new Schema(
  {
    eventId: { type: Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
    countedBy: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
    countedPaise: { type: Number, required: true, min: 0, validate: Number.isInteger },
    expectedPaise: { type: Number, required: true, validate: Number.isInteger },
    differencePaise: { type: Number, required: true, validate: Number.isInteger },
    note: { type: String, trim: true, maxlength: 300 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

makeAppendOnly(cashCountSchema, 'Cash counts', 'record a new count instead');

export type CashCountFields = InferSchemaType<typeof cashCountSchema>;

export const CashCount = model('CashCount', cashCountSchema, 'cash_counts');
