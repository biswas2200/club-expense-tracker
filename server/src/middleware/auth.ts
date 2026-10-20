import type { RequestHandler } from 'express';
import { isValidObjectId } from 'mongoose';
import type { Role } from '@nocap/shared';
import { HttpError } from '../lib/http';
import { Member } from '../models/Member';

export const SESSION_COOKIE = 'nocap_session';

/** Loads the member from the signed session cookie. A tampered cookie fails the signature check. */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  const memberId: unknown = req.signedCookies?.[SESSION_COOKIE];
  if (typeof memberId !== 'string' || !isValidObjectId(memberId)) {
    throw new HttpError(401, 'Please log in');
  }
  const member = await Member.findById(memberId);
  if (!member) throw new HttpError(401, 'Please log in');
  req.member = member;
  next();
};

export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.member || !roles.includes(req.member.role)) {
      throw new HttpError(403, `Only ${roles.join(' or ')} accounts can do this`);
    }
    next();
  };
}
