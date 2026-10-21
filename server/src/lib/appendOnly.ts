import type { Schema } from 'mongoose';

export class AppendOnlyError extends Error {
  constructor(what: string, hint: string) {
    super(`${what} are append-only: ${hint}`);
  }
}

const QUERY_WRITES = [
  'updateOne',
  'updateMany',
  'findOneAndUpdate',
  'replaceOne',
  'findOneAndReplace',
  'deleteOne',
  'deleteMany',
  'findOneAndDelete',
] as const;

/**
 * Makes every Mongoose path that could change or remove a stored document throw.
 * Raw driver calls bypass this; v1.0-beta adds a database user without update or delete rights.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function makeAppendOnly(schema: Schema<any>, what: string, hint: string) {
  const refuse = async () => {
    throw new AppendOnlyError(what, hint);
  };
  schema.pre([...QUERY_WRITES], { document: false, query: true }, refuse);
  schema.pre(['updateOne', 'deleteOne'], { document: true, query: false }, refuse);
  schema.pre('save', async function () {
    if (!this.isNew) throw new AppendOnlyError(what, hint);
  });
}
