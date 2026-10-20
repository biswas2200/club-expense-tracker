import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createCast, loginAs, useTestApp } from './helpers';

describe('dev login', () => {
  const ctx = useTestApp();

  it('lists members to log in as, without phone numbers', async () => {
    await createCast();
    const res = await request(ctx.app).get('/api/auth/dev-members').expect(200);
    expect(res.body).toHaveLength(4);
    expect(res.body[0]).toEqual({
      id: expect.any(String),
      name: expect.any(String),
      role: expect.any(String),
    });
  });

  it('logs in and returns the member from /me', async () => {
    const { member } = await createCast();
    const agent = await loginAs(ctx.app, member._id);
    const res = await agent.get('/api/auth/me').expect(200);
    expect(res.body).toEqual({ id: String(member._id), name: 'Chitra Member', role: 'member' });
  });

  it('sets an httpOnly cookie', async () => {
    const { member } = await createCast();
    const res = await request(ctx.app)
      .post('/api/auth/dev-login')
      .send({ memberId: String(member._id) })
      .expect(200);
    expect(String(res.headers['set-cookie'])).toMatch(/HttpOnly/i);
  });

  it('rejects an unknown member', async () => {
    await request(ctx.app)
      .post('/api/auth/dev-login')
      .send({ memberId: '64b7f0f0f0f0f0f0f0f0f0f0' })
      .expect(404);
    await request(ctx.app).post('/api/auth/dev-login').send({ memberId: 'nope' }).expect(400);
  });

  it('returns 401 from /me without a session', async () => {
    await request(ctx.app).get('/api/auth/me').expect(401);
  });

  it('ignores a forged cookie', async () => {
    const { admin } = await createCast();
    await request(ctx.app)
      .get('/api/auth/me')
      .set('Cookie', `nocap_session=${String(admin._id)}`)
      .expect(401);
  });

  it('logs out', async () => {
    const { member } = await createCast();
    const agent = await loginAs(ctx.app, member._id);
    await agent.post('/api/auth/logout').expect(204);
    await agent.get('/api/auth/me').expect(401);
  });
});

describe('dev login switched off', () => {
  const ctx = useTestApp({ devLogin: false });

  it('hides the dev login routes', async () => {
    const { admin } = await createCast();
    await request(ctx.app).get('/api/auth/dev-members').expect(404);
    await request(ctx.app)
      .post('/api/auth/dev-login')
      .send({ memberId: String(admin._id) })
      .expect(404);
  });
});
