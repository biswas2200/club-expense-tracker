import type { Types } from 'mongoose';
import type { PersonRef } from '@nocap/shared';
import { Member } from '../models/Member';

type Id = Types.ObjectId | string | null | undefined;

/** Loads the names of everyone referenced, in one query. */
export async function namesFor(ids: Id[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean).map(String))];
  const people = await Member.find({ _id: { $in: unique } }, { name: 1 }).lean();
  return new Map(people.map((p) => [String(p._id), p.name]));
}

export function personRef(names: Map<string, string>, id: Id): PersonRef | undefined {
  if (!id) return undefined;
  return { id: String(id), name: names.get(String(id)) ?? 'Unknown' };
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** An admin or member whose full name matches, ignoring case and extra spaces. */
export function findClubMemberByName(name: string) {
  const wanted = name.trim().replace(/\s+/g, ' ');
  if (!wanted) return Promise.resolve(null);
  return Member.findOne({
    role: { $in: ['admin', 'member'] },
    name: { $regex: `^${escapeRegExp(wanted)}$`, $options: 'i' },
  }).lean();
}
