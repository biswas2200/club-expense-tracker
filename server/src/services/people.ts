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
