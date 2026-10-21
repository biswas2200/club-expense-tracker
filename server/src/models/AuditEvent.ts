import { model, Schema, type InferSchemaType } from 'mongoose';
import { ACTIVITY_ACTIONS } from '@nocap/shared';
import { makeAppendOnly } from '../lib/appendOnly';

/** One line of the activity log: who did what, in plain words. */
const auditEventSchema = new Schema(
  {
    actorId: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
    action: { type: String, enum: ACTIVITY_ACTIONS, required: true },
    eventId: { type: Schema.Types.ObjectId, ref: 'Event', index: true },
    entryId: { type: Schema.Types.ObjectId, ref: 'LedgerEntry' },
    summary: { type: String, required: true, maxlength: 600 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

auditEventSchema.index({ createdAt: -1 });

makeAppendOnly(auditEventSchema, 'Audit events', 'the activity log is never edited');

export type AuditEventFields = InferSchemaType<typeof auditEventSchema>;

export const AuditEvent = model('AuditEvent', auditEventSchema, 'audit_log');
