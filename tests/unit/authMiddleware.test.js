/**
 * authMiddleware in strict and optional mode, with firebase-admin mocked.
 */
const mockVerifyIdToken = jest.fn();
jest.mock('firebase-admin', () => ({
  apps: [],
  initializeApp: jest.fn(),
  credential: { cert: jest.fn(() => ({})) },
  auth: () => ({ verifyIdToken: mockVerifyIdToken }),
}));

const FAKE_SA = JSON.stringify({ project_id: 'test', client_email: 'x@test.iam.gserviceaccount.com', private_key: 'k' });

function load(env) {
  let mw;
  jest.isolateModules(() => {
    Object.assign(process.env, env);
    mw = require('../../src/middleware/authMiddleware');
  });
  return mw;
}

function run(mw, authorization) {
  const req = { headers: authorization ? { authorization } : {} };
  const res = {
    statusCode: 200,
    body: undefined,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
  const next = jest.fn();
  return mw(req, res, next).then(() => ({ req, res, next }));
}

beforeEach(() => {
  mockVerifyIdToken.mockReset();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  process.env.AUTH_MODE = 'optional';
  jest.restoreAllMocks();
});

describe('strict mode', () => {
  const env = { AUTH_MODE: 'strict', FIREBASE_SERVICE_ACCOUNT_JSON: FAKE_SA };

  test('missing credentials -> fails fast at startup', () => {
    delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    expect(() => load({ AUTH_MODE: 'strict' })).toThrow(/Firebase Admin credentials are missing/);
  });

  test('credentials accepted as base64 too', () => {
    const mw = load({ ...env, FIREBASE_SERVICE_ACCOUNT_JSON: Buffer.from(FAKE_SA).toString('base64') });
    expect(mw.firebaseInitialized).toBe(true);
  });

  test('no token -> 401 AUTH_REQUIRED', async () => {
    const { res, next } = await run(load(env));
    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe('AUTH_REQUIRED');
    expect(next).not.toHaveBeenCalled();
  });

  test('valid token with verified email -> next(), req.user set', async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: 'u1', email: 'a@b.co', email_verified: true });
    const { req, next } = await run(load(env), 'Bearer good');
    expect(mockVerifyIdToken).toHaveBeenCalledWith('good');
    expect(next).toHaveBeenCalled();
    expect(req.user).toEqual({ uid: 'u1', email: 'a@b.co', emailVerified: true });
  });

  test('unverified email -> 403 EMAIL_NOT_VERIFIED with Arabic message', async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: 'u1', email_verified: false });
    const { res } = await run(load(env), 'Bearer good');
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('EMAIL_NOT_VERIFIED');
    expect(res.body.message).toMatch(/التحقق/);
  });

  test('expired token -> 403 AUTH_EXPIRED', async () => {
    mockVerifyIdToken.mockRejectedValue(Object.assign(new Error('x'), { code: 'auth/id-token-expired' }));
    const { res } = await run(load(env), 'Bearer old');
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('AUTH_EXPIRED');
  });

  test('invalid token -> 403 AUTH_INVALID', async () => {
    mockVerifyIdToken.mockRejectedValue(new Error('bad'));
    const { res } = await run(load(env), 'Bearer bad');
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('AUTH_INVALID');
  });

  test('a self-signed JWT is no longer accepted (JWT scheme removed)', async () => {
    mockVerifyIdToken.mockRejectedValue(new Error('not a firebase token'));
    const { res, next } = await run(load(env), 'Bearer eyJhbGciOiJIUzI1NiJ9.e30.x');
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('optional mode', () => {
  test('no token -> next(), req.user null', async () => {
    const { req, next } = await run(load({ AUTH_MODE: 'optional' }));
    expect(next).toHaveBeenCalled();
    expect(req.user).toBeNull();
  });

  test('invalid token with Firebase configured -> still next()', async () => {
    mockVerifyIdToken.mockRejectedValue(new Error('bad'));
    const { req, next } = await run(load({ AUTH_MODE: 'optional', FIREBASE_SERVICE_ACCOUNT_JSON: FAKE_SA }), 'Bearer bad');
    expect(next).toHaveBeenCalled();
    expect(req.user).toBeNull();
  });

  test('valid token -> req.user set', async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: 'u2', email: 'c@d.co', email_verified: false });
    const { req, next } = await run(load({ AUTH_MODE: 'optional', FIREBASE_SERVICE_ACCOUNT_JSON: FAKE_SA }), 'Bearer ok');
    expect(next).toHaveBeenCalled();
    expect(req.user.uid).toBe('u2');
  });
});
