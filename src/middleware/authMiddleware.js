/**
 * Auth for /api/*, controlled by AUTH_MODE:
 *   strict   (default) requires a valid Firebase ID token with a verified email
 *   optional lets every request through; a valid token still sets req.user
 *
 * Tokens are Firebase ID tokens from the app's Firebase Auth sign-in
 * (`Authorization: Bearer <idToken>`). The self-issued JWT scheme was removed
 * together with the unused /auth routes (audit C4/H5).
 *
 * Firebase Admin credentials, in order of preference:
 *   FIREBASE_SERVICE_ACCOUNT_JSON  the service-account JSON, raw or base64 (use this on Vercel)
 *   firebase-service-account-key.json in the repo root (local dev only; git-ignored)
 */
const admin = require("firebase-admin");

const AUTH_MODE = process.env.AUTH_MODE || "strict";

function loadServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (raw) {
    const text = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    return JSON.parse(text);
  }
  try {
    return require("../../firebase-service-account-key.json");
  } catch {
    return null;
  }
}

let firebaseInitialized = false;
try {
  const serviceAccount = loadServiceAccount();
  if (serviceAccount) {
    if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    firebaseInitialized = true;
  }
} catch (error) {
  console.error(`Firebase Admin init failed: ${error.message}`);
}

if (!firebaseInitialized) {
  if (AUTH_MODE === "optional") {
    console.warn("Firebase Admin not configured; AUTH_MODE=optional so /api is open.");
  } else {
    // Fail fast: strict mode cannot verify anyone without credentials.
    throw new Error("AUTH_MODE is strict but Firebase Admin credentials are missing (set FIREBASE_SERVICE_ACCOUNT_JSON).");
  }
}

const UNVERIFIED_MESSAGE = "يرجى التحقق من بريدك الإلكتروني للوصول إلى هذه الميزة.";

async function authenticateToken(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    if (AUTH_MODE === "optional") {
      req.user = null;
      return next();
    }
    return res.status(401).json({ error: "Unauthorized: No token provided.", code: "AUTH_REQUIRED" });
  }

  if (!firebaseInitialized) {
    // Only reachable in optional mode.
    req.user = null;
    return next();
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = { uid: decoded.uid, email: decoded.email, emailVerified: decoded.email_verified };
  } catch (error) {
    if (AUTH_MODE === "optional") {
      req.user = null;
      return next();
    }
    const expired = error && error.code === "auth/id-token-expired";
    return res.status(403).json({
      error: expired ? "Forbidden: Token has expired." : "Forbidden: Invalid or unverifiable token.",
      code: expired ? "AUTH_EXPIRED" : "AUTH_INVALID",
    });
  }

  if (AUTH_MODE === "strict" && !req.user.emailVerified) {
    return res.status(403).json({ error: "Forbidden: Email not verified.", message: UNVERIFIED_MESSAGE, code: "EMAIL_NOT_VERIFIED" });
  }
  return next();
}

authenticateToken.firebaseInitialized = firebaseInitialized;
module.exports = authenticateToken;
