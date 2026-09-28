// Test environment. Never put real keys here.
process.env.NODE_ENV = 'test';
process.env.PORT = '0';
process.env.AUTH_MODE = 'optional';
// Tests must never reach Gemini: aiService is mocked in every suite.
delete process.env.GOOGLE_GENAI_API_KEY;
// Rate limits are exercised in their own tests; keep them out of the way elsewhere.
process.env.RATE_LIMIT_API_PER_MIN = '100000';
process.env.RATE_LIMIT_AI_PER_MIN = '100000';
