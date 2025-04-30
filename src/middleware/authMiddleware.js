// const admin = require("firebase-admin");
// require("dotenv").config(); // Ensure env variables are loaded

// // Load the service account key
// const serviceAccount = require("../../firebase-service-account-key.json");

// // Initialize Firebase Admin SDK only once
// try {
//   if (!admin.apps.length) {
//     admin.initializeApp({
//       credential: admin.credential.cert(serviceAccount),
//     });
//     console.log("Firebase Admin SDK initialized successfully.");
//   } else {
//     console.log("Firebase Admin SDK already initialized.");
//   }
// } catch (error) {
//   console.error("Error initializing Firebase Admin SDK:", error);
//   process.exit(1);
// }

// const authenticateToken = async (req, res, next) => {
//   const authHeader = req.headers["authorization"];
//   const token = authHeader && authHeader.split(" ")[1]; // Expecting "Bearer TOKEN"
//   const authMode = process.env.AUTH_MODE || 'strict'; // Default to strict authentication

//   if (token == null) {
//     if (authMode === 'optional') {
//       // In optional mode, allow request to proceed without a token
//       console.warn("No Firebase ID token provided. Proceeding without authentication (AUTH_MODE=optional).");
//       req.user = null; // Indicate no authenticated user
//       return next();
//     } else {
//       // In strict mode (default), reject requests without a token
//       return res.status(401).json({ error: "Unauthorized: No token provided." });
//     }
//   }

//   // If a token is provided, always try to verify it
//   try {
//     const decodedToken = await admin.auth().verifyIdToken(token);
//     req.user = {
//         uid: decodedToken.uid,
//         email: decodedToken.email,
//     };
//     console.log(`User authenticated: ${req.user.uid}`);
//     next(); // Token is valid, proceed

//   } catch (error) {
//     console.error("Error verifying Firebase ID token:", error);

//     // If verification fails, decide based on authMode
//     if (authMode === 'optional') {
//         console.warn(`Firebase token verification failed (AUTH_MODE=optional). Proceeding without authentication. Error: ${error.message}`);
//         req.user = null; // Indicate authentication failure but proceed
//         return next();
//     } else {
//         // In strict mode, reject requests with invalid/expired tokens
//         if (error.code === 'auth/id-token-expired') {
//             return res.status(403).json({ error: "Forbidden: Token has expired." });
//         } else if (error.code === 'auth/argument-error') {
//             return res.status(403).json({ error: "Forbidden: Invalid token format." });
//         }
//         return res.status(403).json({ error: "Forbidden: Invalid or unverifiable token." });
//     }
//   }
// };

// module.exports = authenticateToken;


const admin = require("firebase-admin");
const dotenv = require("dotenv");

// Ensure environment variables are loaded
dotenv.config();

// Get the auth mode from environment variables - default to 'strict'
const AUTH_MODE = process.env.AUTH_MODE || 'strict';
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
 * Authentication middleware that verifies Firebase ID tokens
 * When AUTH_MODE=optional, requests without tokens or with invalid tokens will be allowed
 */
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // Expecting "Bearer TOKEN"

  // Log the current authentication settings
  console.log(`Authentication check - AUTH_MODE: ${AUTH_MODE}`);
  
  // Case 1: No token provided
  if (!token) {
    if (AUTH_MODE === 'optional') {
      // In optional mode, allow request to proceed without a token
      console.log("No Firebase ID token provided. Proceeding without authentication (AUTH_MODE=optional).");
      req.user = null; // Indicate no authenticated user
      return next();
    } else {
      // In strict mode (default), reject requests without a token
      return res.status(401).json({ error: "Unauthorized: No token provided." });
    }
  }

  // Case 2: Token provided but Firebase not initialized
  if (!firebaseInitialized) {
    if (AUTH_MODE === 'optional') {
      console.warn("Token provided but Firebase not initialized. Proceeding without authentication (AUTH_MODE=optional).");
      req.user = null;
      return next();
    } else {
      return res.status(500).json({ error: "Server configuration error: Firebase not initialized." });
    }
  }

  // Case 3: Token provided and Firebase initialized - verify the token
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
    };
    console.log(`User authenticated: ${req.user.uid}`);
    next(); // Token is valid, proceed
  } catch (error) {
    console.error("Error verifying Firebase ID token:", error);

    // If verification fails, decide based on authMode
    if (AUTH_MODE === 'optional') {
      console.warn(`Firebase token verification failed (AUTH_MODE=optional). Proceeding without authentication. Error: ${error.message}`);
      req.user = null; // Indicate authentication failure but proceed
      return next();
    } else {
      // In strict mode, reject requests with invalid/expired tokens
      if (error.code === 'auth/id-token-expired') {
        return res.status(403).json({ error: "Forbidden: Token has expired." });
      } else if (error.code === 'auth/argument-error') {
        return res.status(403).json({ error: "Forbidden: Invalid token format." });
      }
      return res.status(403).json({ error: "Forbidden: Invalid or unverifiable token." });
    }
  }
};

module.exports = authenticateToken;