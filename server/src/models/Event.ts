import { model, Schema, type InferSchemaType } from 'mongoose';

const eventSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    budgetPaise: { type: Number, required: true, min: 0, validate: Number.isInteger },
    /** What each admin and member owes for the event; 0 means no fee. */
    feePaise: { type: Number, default: 0, min: 0, validate: Number.isInteger },
    createdBy: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
  },
  { timestamps: true },
);

export type EventFields = InferSchemaType<typeof eventSchema>;

export const Event = model('Event', eventSchema, 'events');
