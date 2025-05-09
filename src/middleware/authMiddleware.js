// const admin = require("firebase-admin");
// const dotenv = require("dotenv");

// // Ensure environment variables are loaded
// dotenv.config();

// // Get the auth mode from environment variables - default to 'strict'
// const AUTH_MODE = process.env.AUTH_MODE || 'strict';
// console.log(`AUTH_MODE set to: ${AUTH_MODE}`);

// // Load the service account key
// let serviceAccount;
// try {
//   serviceAccount = require("../../firebase-service-account-key.json");
// } catch (error) {
//   console.warn("Firebase service account key not found or invalid. Firebase authentication will not work.");
  
//   if (AUTH_MODE !== 'optional') {
//     console.error("ERROR: Missing Firebase credentials but AUTH_MODE is not set to 'optional'");
//     console.error("Set AUTH_MODE=optional in .env file to allow requests without authentication");
//     process.exit(1);
//   }
// }

// // Initialize Firebase Admin SDK only if we have valid credentials
// let firebaseInitialized = false;
// if (serviceAccount) {
//   try {
//     if (!admin.apps.length) {
//       admin.initializeApp({
//         credential: admin.credential.cert(serviceAccount),
//       });
//       console.log("Firebase Admin SDK initialized successfully.");
//       firebaseInitialized = true;
//     } else {
//       console.log("Firebase Admin SDK already initialized.");
//       firebaseInitialized = true;
//     }
//   } catch (error) {
//     console.error("Error initializing Firebase Admin SDK:", error);
//     if (AUTH_MODE !== 'optional') {
//       process.exit(1);
//     }
//   }
// }

// /**
//  * Authentication middleware that verifies Firebase ID tokens
//  * and checks for email verification in strict mode.
//  * When AUTH_MODE=optional, requests without tokens or with invalid tokens will be allowed.
//  */
// const authenticateToken = async (req, res, next) => {
//   const authHeader = req.headers["authorization"];
//   const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : null; // Expecting "Bearer TOKEN"

//   // Log the current authentication settings and token presence/length
//   console.log(`Authentication check - AUTH_MODE: ${AUTH_MODE}`);
//   if (token) {
//     console.log(`Received Bearer token (length: ${token.length}). Verifying...`); // Log token presence and length
//   } else {
//     console.log("No Bearer token found in Authorization header.");
//   }
  
//   // Case 1: No token provided
//   if (!token) {
//     if (AUTH_MODE === 'optional') {
//       console.log("No Firebase ID token provided. Proceeding without authentication (AUTH_MODE=optional).");
//       req.user = null; // Indicate no authenticated user
//       return next();
//     } else {
//       return res.status(401).json({ error: "Unauthorized: No token provided." });
//     }
//   }

//   // Case 2: Token provided but Firebase not initialized
//   if (!firebaseInitialized) {
//     if (AUTH_MODE === 'optional') {
//       console.warn("Token provided but Firebase not initialized. Proceeding without authentication (AUTH_MODE=optional).");
//       req.user = null;
//       return next();
//     } else {
//       return res.status(500).json({ error: "Server configuration error: Firebase not initialized." });
//     }
//   }

//   // Case 3: Token provided and Firebase initialized - verify the token
//   try {
//     const decodedToken = await admin.auth().verifyIdToken(token);
//     req.user = {
//       uid: decodedToken.uid,
//       email: decodedToken.email,
//       emailVerified: decodedToken.email_verified // Include emailVerified status
//     };
//     console.log(`User authenticated: ${req.user.uid}, Email Verified: ${req.user.emailVerified}`);

//     // Case 3a: Check email verification status (only in strict mode)
//     if (AUTH_MODE === 'strict' && !req.user.emailVerified) {
//         console.warn(`User ${req.user.uid} attempted access with unverified email.`);
//         return res.status(403).json({ error: "Forbidden: Email not verified.", message: "يرجى التحقق من بريدك الإلكتروني للوصول إلى هذه الميزة." });
//     }

//     // Proceed if email is verified or if mode is optional
//     next(); 

//   } catch (error) {
//     console.error("Error verifying Firebase ID token:", error);

//     // If verification fails, decide based on authMode
//     if (AUTH_MODE === 'optional') {
//       console.warn(`Firebase token verification failed (AUTH_MODE=optional). Proceeding without authentication. Error: ${error.message}`);
//       req.user = null; // Indicate authentication failure but proceed
//       return next();
//     } else {
//       // In strict mode, reject requests with invalid/expired tokens
//       if (error.code === 'auth/id-token-expired') {
//         return res.status(403).json({ error: "Forbidden: Token has expired." });
//       } else if (error.code === 'auth/argument-error') {
//         return res.status(403).json({ error: "Forbidden: Invalid token format." });
//       }
//       return res.status(403).json({ error: "Forbidden: Invalid or unverifiable token." });
//     }
//   }
// };

// module.exports = authenticateToken;

const admin = require("firebase-admin");
const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");

// Ensure environment variables are loaded
dotenv.config();

// Get the auth mode from environment variables - default to 'strict'
const AUTH_MODE = process.env.AUTH_MODE || 'strict';
// JWT Secret key
const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret_key";

console.log(`AUTH_MODE set to: ${AUTH_MODE}`);

// Load the service account key
let serviceAccount;
try {
  serviceAccount = require("../../firebase-service-account-key.json");
} catch (error) {
  console.warn("Firebase service account key not found or invalid. Firebase authentication will not work.");
  
  if (AUTH_MODE !== 'optional') {
    console.error("ERROR: Missing Firebase credentials but AUTH_MODE is not set to 'optional'");
    console.error("Set AUTH_MODE=optional in .env file to allow requests without authentication");
    process.exit(1);
  }
}

// Initialize Firebase Admin SDK only if we have valid credentials
let firebaseInitialized = false;
if (serviceAccount) {
  try {
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log("Firebase Admin SDK initialized successfully.");
      firebaseInitialized = true;
    } else {
      console.log("Firebase Admin SDK already initialized.");
      firebaseInitialized = true;
    }
  } catch (error) {
    console.error("Error initializing Firebase Admin SDK:", error);
    if (AUTH_MODE !== 'optional') {
      process.exit(1);
    }
  }
}

/**
 * Authentication middleware that verifies either:
 * 1. Firebase ID tokens (legacy method)
 * 2. JWT tokens (new method)
 * 
 * When AUTH_MODE=optional, requests without tokens or with invalid tokens will be allowed.
 */
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : null; // Expecting "Bearer TOKEN"

  // Log the current authentication settings and token presence/length
  console.log(`Authentication check - AUTH_MODE: ${AUTH_MODE}`);
  if (token) {
    console.log(`Received Bearer token (length: ${token.length}). Verifying...`); // Log token presence and length
  } else {
    console.log("No Bearer token found in Authorization header.");
  }
  
  // Case 1: No token provided
  if (!token) {
    if (AUTH_MODE === 'optional') {
      console.log("No token provided. Proceeding without authentication (AUTH_MODE=optional).");
      req.user = null; // Indicate no authenticated user
      return next();
    } else {
      return res.status(401).json({ error: "Unauthorized: No token provided." });
    }
  }

  // Case 2: Token provided but Firebase not initialized
  if (!firebaseInitialized && AUTH_MODE !== 'optional') {
    return res.status(500).json({ error: "Server configuration error: Authentication system not initialized." });
  }

  // Case 3: Try to verify the token using JWT first, then fallback to Firebase
  try {
    // First, try to validate as a JWT token
    try {
      const decodedToken = jwt.verify(token, JWT_SECRET);
      req.user = {
        uid: decodedToken.uid,
        email: decodedToken.email,
        emailVerified: decodedToken.email_verified
      };
      console.log(`User authenticated via JWT: ${req.user.uid}, Email Verified: ${req.user.emailVerified}`);
      
      // Case 3a: Check email verification status (only in strict mode)
      if (AUTH_MODE === 'strict' && !req.user.emailVerified) {
        console.warn(`JWT User ${req.user.uid} attempted access with unverified email.`);
        return res.status(403).json({ 
          error: "Forbidden: Email not verified.", 
          message: "يرجى التحقق من بريدك الإلكتروني للوصول إلى هذه الميزة." 
        });
      }
      
      // JWT token is valid, proceed
      return next();
    } catch (jwtError) {
      // If JWT validation fails, try Firebase token
      console.log("JWT validation failed, trying Firebase token instead:", jwtError.message);
      
      if (!firebaseInitialized) {
        throw new Error("Firebase not initialized, cannot verify Firebase token");
      }
      
      // Try to verify as a Firebase token
      const decodedFirebaseToken = await admin.auth().verifyIdToken(token);
      req.user = {
        uid: decodedFirebaseToken.uid,
        email: decodedFirebaseToken.email,
        emailVerified: decodedFirebaseToken.email_verified
      };
      console.log(`User authenticated via Firebase: ${req.user.uid}, Email Verified: ${req.user.emailVerified}`);

      // Check email verification status for Firebase token (only in strict mode)
      if (AUTH_MODE === 'strict' && !req.user.emailVerified) {
        console.warn(`Firebase User ${req.user.uid} attempted access with unverified email.`);
        return res.status(403).json({ 
          error: "Forbidden: Email not verified.", 
          message: "يرجى التحقق من بريدك الإلكتروني للوصول إلى هذه الميزة." 
        });
      }
      
      // Firebase token is valid, proceed
      return next();
    }
  } catch (error) {
    console.error("Error verifying token:", error);

    // If verification fails, decide based on authMode
    if (AUTH_MODE === 'optional') {
      console.warn(`Token verification failed (AUTH_MODE=optional). Proceeding without authentication.`);
      req.user = null; // Indicate authentication failure but proceed
      return next();
    } else {
      // In strict mode, reject requests with invalid/expired tokens
      if (error.name === 'TokenExpiredError' || error.code === 'auth/id-token-expired') {
        return res.status(403).json({ error: "Forbidden: Token has expired." });
      } else if (error.code === 'auth/argument-error') {
        return res.status(403).json({ error: "Forbidden: Invalid token format." });
      }
      return res.status(403).json({ error: "Forbidden: Invalid or unverifiable token." });
    }
  }
};

module.exports = authenticateToken;