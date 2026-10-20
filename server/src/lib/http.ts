import type { ErrorRequestHandler } from 'express';
import multer from 'multer';
import { isValidObjectId } from 'mongoose';
import { ZodError } from 'zod';

/** An error with an HTTP status and a message that is safe to show to the user. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new HttpError(404, `${what} not found`);

/** Malformed ids are treated as "not found" so callers can't probe the id format. */
export function assertObjectId(id: string | undefined, what: string): string {
  if (!id || !isValidObjectId(id)) throw notFound(what);
  return id;
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err instanceof ZodError) {
    const details: Record<string, string> = {};
    for (const issue of err.issues) details[issue.path.join('.') || 'body'] ??= issue.message;
    res.status(400).json({ error: err.issues[0]?.message ?? 'Invalid request', details });
    return;
  }
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: 'Proof must be 5 MB or smaller' });
    } else {
      res.status(400).json({ error: `Upload problem: ${err.message}` });
    }
    return;
  }
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Request body is not valid JSON' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server' });
};
