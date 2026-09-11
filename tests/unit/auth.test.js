import { describe, it, expect, vi, beforeEach } from 'vitest';

const { jwtVerify, createClient, getUser } = vi.hoisted(() => ({
  jwtVerify: vi.fn(),
  createClient: vi.fn(),
  getUser: vi.fn(),
}));

// Keep jose's real error classes (the middleware branches on instanceof) but
// stub verification and the remote JWKS fetch.
vi.mock('jose', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, jwtVerify, createRemoteJWKSet: vi.fn(() => ({})) };
});
vi.mock('@supabase/supabase-js', () => ({ createClient }));

// The JWKS URL is built from SUPABASE_URL at import time, so set it first and
// import the middleware dynamically.
const SUPABASE_URL = 'https://unit-test.supabase.co';
process.env.SUPABASE_URL = SUPABASE_URL;
process.env.SUPABASE_ANON_KEY = 'anon-test-key';
const { requireAuth, requireSelf } = await import('../../middleware/auth.js');
const { errors: joseErrors } = await import('jose');

async function call(headers = {}) {
  const req = { headers };
  const res = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  const next = vi.fn();
  await requireAuth(req, res, next);
  return { req, res, next };
}

beforeEach(() => {
  createClient.mockImplementation(() => ({ auth: { getUser } }));
});

describe('requireAuth', () => {
  it('returns 401 when there is no Authorization header', async () => {
    const { res, next } = await call();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Not logged in.' });
    expect(next).not.toHaveBeenCalled();
    expect(jwtVerify).not.toHaveBeenCalled();
  });

  it('returns 401 for a non-Bearer scheme', async () => {
    const { res, next } = await call({ authorization: 'Basic abc' });
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 for "Bearer garbage" (invalid token) without a remote fallback', async () => {
    jwtVerify.mockRejectedValue(new joseErrors.JWTInvalid('bad token'));
    const { res, next } = await call({ authorization: 'Bearer garbage' });

    expect(jwtVerify).toHaveBeenCalledWith('garbage', expect.anything(), {
      issuer: `${SUPABASE_URL}/auth/v1`,
      audience: 'authenticated',
    });
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired session.' });
    expect(next).not.toHaveBeenCalled();
    expect(getUser).not.toHaveBeenCalled();
  });

  it.each([
    ['expired', () => new joseErrors.JWTExpired('exp', { exp: 1 }, 'exp')],
    ['bad signature', () => new joseErrors.JWSSignatureVerificationFailed()],
    ['wrong audience', () => new joseErrors.JWTClaimValidationFailed('aud', {}, 'aud')],
  ])('returns 401 for a %s token', async (_label, makeErr) => {
    jwtVerify.mockRejectedValue(makeErr());
    const { res, next } = await call({ authorization: 'Bearer tok' });
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when the payload has no subject', async () => {
    jwtVerify.mockResolvedValue({ payload: { email: 'a@b.c' } });
    const { res, next } = await call({ authorization: 'Bearer tok' });
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('sets req.user from a valid token and calls next()', async () => {
    jwtVerify.mockResolvedValue({
      payload: { sub: 'user-1', email: 'a@b.c', role: 'authenticated' },
    });
    const { req, res, next } = await call({ authorization: 'Bearer good-token' });

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(req.user).toEqual({ id: 'user-1', email: 'a@b.c', role: 'authenticated' });
    // RLS-scoped client carries the caller's own token, never the service role.
    expect(createClient).toHaveBeenCalledWith(SUPABASE_URL, 'anon-test-key', {
      global: { headers: { Authorization: 'Bearer good-token' }, fetch: expect.any(Function) },
    });
    expect(req.supabase).toBeDefined();
  });

  it('defaults email to null and role to authenticated', async () => {
    jwtVerify.mockResolvedValue({ payload: { sub: 'user-2' } });
    const { req } = await call({ authorization: 'Bearer tok' });
    expect(req.user).toEqual({ id: 'user-2', email: null, role: 'authenticated' });
  });

  describe('remote fallback (no matching key / JWKS unreachable)', () => {
    beforeEach(() => {
      jwtVerify.mockRejectedValue(new Error('no applicable key found'));
    });

    it('accepts the token when Supabase confirms the user', async () => {
      getUser.mockResolvedValue({
        data: { user: { id: 'user-3', email: null, role: 'authenticated' } },
        error: null,
      });
      const { req, next } = await call({ authorization: 'Bearer legacy' });
      expect(getUser).toHaveBeenCalledWith('legacy');
      expect(next).toHaveBeenCalledTimes(1);
      expect(req.user.id).toBe('user-3');
    });

    it('returns 401 when Supabase rejects the token', async () => {
      getUser.mockResolvedValue({ data: { user: null }, error: { message: 'invalid' } });
      const { res, next } = await call({ authorization: 'Bearer legacy' });
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 503 when the remote check itself fails', async () => {
      getUser.mockRejectedValue(new Error('ENOTFOUND'));
      const { res, next } = await call({ authorization: 'Bearer legacy' });
      expect(res.status).toHaveBeenCalledWith(503);
      expect(next).not.toHaveBeenCalled();
    });
  });
});

describe('requireSelf', () => {
  const run = (req) => {
    const res = {};
    res.status = vi.fn(() => res);
    res.json = vi.fn(() => res);
    const next = vi.fn();
    requireSelf('userId')({ user: { id: 'me' }, params: {}, query: {}, ...req }, res, next);
    return { res, next };
  };

  it('passes when the requested id is the caller', () => {
    expect(run({ params: { userId: 'me' } }).next).toHaveBeenCalled();
    expect(run({ query: { userId: 'me' } }).next).toHaveBeenCalled();
    expect(run({ body: { userId: 'me' } }).next).toHaveBeenCalled();
  });

  it('returns 403 for another user and 400 when the id is missing', () => {
    const other = run({ params: { userId: 'someone-else' } });
    expect(other.res.status).toHaveBeenCalledWith(403);
    expect(other.next).not.toHaveBeenCalled();

    const missing = run({});
    expect(missing.res.status).toHaveBeenCalledWith(400);
    expect(missing.next).not.toHaveBeenCalled();
  });
});
