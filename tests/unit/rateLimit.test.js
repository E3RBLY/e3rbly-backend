const { createRateLimiter, clientIp } = require('../../src/middleware/rateLimit');

function call(limiter, ip = '1.1.1.1') {
  const req = { headers: { 'x-forwarded-for': `${ip}, 10.0.0.1` } };
  const res = {
    headers: {},
    statusCode: 200,
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
  const next = jest.fn();
  limiter(req, res, next);
  return { res, next };
}

test('clientIp uses the first x-forwarded-for entry', () => {
  expect(clientIp({ headers: { 'x-forwarded-for': '9.9.9.9, 10.0.0.1' } })).toBe('9.9.9.9');
  expect(clientIp({ headers: {}, ip: '8.8.8.8' })).toBe('8.8.8.8');
});

test('allows max requests per window, then 429 with Retry-After and Arabic message', () => {
  let t = 0;
  const limiter = createRateLimiter({ windowMs: 60000, max: 2, now: () => t });
  expect(call(limiter).next).toHaveBeenCalled();
  expect(call(limiter).next).toHaveBeenCalled();
  const { res, next } = call(limiter);
  expect(next).not.toHaveBeenCalled();
  expect(res.statusCode).toBe(429);
  expect(res.body.code).toBe('RATE_LIMITED');
  expect(res.body.error).toMatch(/طلبات كثيرة/);
  expect(res.headers['Retry-After']).toBe('60');
});

test('window resets', () => {
  let t = 0;
  const limiter = createRateLimiter({ windowMs: 1000, max: 1, now: () => t });
  call(limiter);
  expect(call(limiter).res.statusCode).toBe(429);
  t = 1001;
  expect(call(limiter).next).toHaveBeenCalled();
});

test('limits are per IP', () => {
  const limiter = createRateLimiter({ windowMs: 60000, max: 1, now: () => 0 });
  call(limiter, '1.1.1.1');
  expect(call(limiter, '2.2.2.2').next).toHaveBeenCalled();
  expect(call(limiter, '1.1.1.1').res.statusCode).toBe(429);
});

test('max 0 disables limiting', () => {
  const limiter = createRateLimiter({ windowMs: 60000, max: 0 });
  for (let i = 0; i < 5; i++) expect(call(limiter).next).toHaveBeenCalled();
});
