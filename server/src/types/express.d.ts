import type { MemberDoc } from '../models/Member';

declare global {
  namespace Express {
    interface Request {
      /** The logged-in member, set by requireAuth. */
      member?: MemberDoc;
    }
  }
}

export {};
