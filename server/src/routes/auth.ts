import { Router, type CookieOptions } from 'express';
import { z } from 'zod';
import { HttpError, notFound } from '../lib/http';
import { requireAuth, SESSION_COOKIE } from '../middleware/auth';
import { Member, toMemberDTO } from '../models/Member';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function authRouter(opts: { devLogin: boolean; secureCookies: boolean }) {
  const router = Router();
  const cookieOptions: CookieOptions = {
    httpOnly: true,
    signed: true,
    sameSite: 'lax',
    secure: opts.secureCookies,
    path: '/',
  };

  if (opts.devLogin) {
    router.get('/dev-members', async (_req, res) => {
      const members = await Member.find().sort({ role: 1, name: 1 });
      res.json(members.map(toMemberDTO));
    });

    router.post('/dev-login', async (req, res) => {
      const { memberId } = z
        .object({ memberId: z.string().regex(/^[0-9a-f]{24}$/i, 'memberId is not valid') })
        .parse(req.body);
      const member = await Member.findById(memberId);
      if (!member) throw notFound('Member');
      res.cookie(SESSION_COOKIE, String(member._id), { ...cookieOptions, maxAge: SEVEN_DAYS_MS });
      res.json(toMemberDTO(member));
    });
  }

  router.get('/me', requireAuth, (req, res) => {
    if (!req.member) throw new HttpError(401, 'Please log in');
    res.json(toMemberDTO(req.member));
  });

  router.post('/logout', (_req, res) => {
    res.clearCookie(SESSION_COOKIE, cookieOptions);
    res.status(204).end();
  });

  return router;
}
