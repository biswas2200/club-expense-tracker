import { model, Schema, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { ROLES, type MemberDTO } from '@nocap/shared';

const memberSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    phone: { type: String, trim: true },
    role: { type: String, enum: ROLES, required: true },
  },
  { timestamps: true },
);

export type MemberFields = InferSchemaType<typeof memberSchema>;
export type MemberDoc = HydratedDocument<MemberFields>;

export const Member = model('Member', memberSchema, 'members');

export function toMemberDTO(member: MemberDoc): MemberDTO {
  return { id: String(member._id), name: member.name, role: member.role };
}
