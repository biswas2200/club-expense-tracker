import { model, Schema, type InferSchemaType } from 'mongoose';
import { ENTRY_SOURCES, VERIFICATION_OUTCOMES } from '@nocap/shared';
import { makeAppendOnly } from '../lib/appendOnly';

/**
 * One check of one ledger entry by the other party. The entry itself never changes: its
 * verified state is the outcome of its latest verification.
 */
const verificationSchema = new Schema(
  {
    entryId: { type: Schema.Types.ObjectId, ref: 'LedgerEntry', required: true, index: true },
    eventId: { type: Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
    verifiedBy: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
    outcome: { type: String, enum: VERIFICATION_OUTCOMES, required: true },
    /** member: the person who paid confirmed; admin: another admin checked the proof. */
    method: { type: String, enum: ['member', 'admin'], required: true },
    note: { type: String, trim: true, maxlength: 300 },
    /** A bill or receipt attached while verifying a cash entry that had none. */
    proofPath: { type: String },
    /** Where the check was made: the web app or a chat with the bot. */
    channel: { type: String, enum: ENTRY_SOURCES, default: 'web' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

makeAppendOnly(verificationSchema, 'Verifications', 'add a new verification instead');

export type VerificationFields = InferSchemaType<typeof verificationSchema>;

export const Verification = model('Verification', verificationSchema, 'verifications');
