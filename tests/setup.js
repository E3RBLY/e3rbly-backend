// Test environment. Never put real keys here.
process.env.NODE_ENV = 'test';
process.env.PORT = '0'; // server.js listens on import; 0 = random free port
process.env.AUTH_MODE = 'optional';
// loginController initializes the Firebase client SDK at import time and
// crashes without an API key (audit finding). Dummy values keep it loadable.
process.env.FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || 'test-dummy-key';
process.env.FIREBASE_AUTH_DOMAIN = process.env.FIREBASE_AUTH_DOMAIN || 'test.firebaseapp.com';
process.env.FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'test-project';
// Tests must never reach Gemini: aiService is mocked in every suite.
delete process.env.GOOGLE_GENAI_API_KEY;
