const admin = require("firebase-admin");
const jwt = require("jsonwebtoken");
const { z } = require("zod");
const { initializeApp } = require("firebase/app");
const { signInWithEmailAndPassword, getAuth } = require("firebase/auth");

// Load environment variables
require("dotenv").config();

// JWT Secret key - ideally this should be in your .env file
const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret_key";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d"; // Token expiration (7 days default)

// Initialize Firebase client SDK
const firebaseConfig = {
  // Add your Firebase client configuration here
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  // ... other config options
};

// Initialize Firebase Client
const firebaseApp = initializeApp(firebaseConfig);
const firebaseAuth = getAuth(firebaseApp);

// Zod schema for login input validation
const loginSchema = z.object({
  email: z.string().email({ message: "البريد الإلكتروني غير صالح" }),
  password: z.string().min(1, { message: "كلمة المرور مطلوبة" }),
});

/**
 * Controller function for user login
 * Authenticates user with Firebase and issues JWT token
 */
const loginUser = async (req, res) => {
  try {
    // Validate input
    const validationResult = loginSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ 
        error: "Invalid input", 
        details: validationResult.error.errors.map(e => e.message) 
      });
    }

    const { email, password } = validationResult.data;

    // Actually sign in with Firebase using email and password
    try {
      const userCredential = await signInWithEmailAndPassword(
        firebaseAuth,
        email,
        password
      );
      
      const user = userCredential.user;
      
      // Check if email is verified (if in strict mode)
      const AUTH_MODE = process.env.AUTH_MODE || 'strict';
      if (AUTH_MODE === 'strict' && !user.emailVerified) {
        return res.status(403).json({ 
          error: "Forbidden", 
          message: "يرجى التحقق من بريدك الإلكتروني قبل تسجيل الدخول",
          emailVerified: false
        });
      }

      // Generate JWT token
      const token = jwt.sign(
        { 
          uid: user.uid,
          email: user.email,
          email_verified: user.emailVerified
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );

      // Return success response
      res.status(200).json({
        message: "تم تسجيل الدخول بنجاح",
        token,
        user: {
          uid: user.uid,
          email: user.email,
          emailVerified: user.emailVerified
        }
      });

    } catch (firebaseError) {
      // Handle Firebase authentication errors
      console.error("Firebase Auth Error:", firebaseError);
      
      return res.status(401).json({ 
        error: "Authentication failed", 
        message: "البريد الإلكتروني أو كلمة المرور غير صحيحة" 
      });
    }
    
  } catch (error) {
    console.error("Error during login:", error);
    res.status(500).json({ 
      error: "Internal Server Error", 
      message: "حدث خطأ أثناء محاولة تسجيل الدخول" 
    });
  }
};

/**
 * Validate a token and return user information
 */
const validateToken = async (req, res) => {
  try {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.startsWith("Bearer ") 
      ? authHeader.split(" ")[1] 
      : null;
    
    if (!token) {
      return res.status(401).json({ 
        error: "Unauthorized", 
        message: "لم يتم تقديم رمز المصادقة" 
      });
    }
    
    // Verify the token
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Optionally fetch fresh user data from Firebase
    const userRecord = await admin.auth().getUser(decoded.uid);
    
    // Return user information
    res.status(200).json({
      valid: true,
      user: {
        uid: userRecord.uid,
        email: userRecord.email,
        emailVerified: userRecord.emailVerified
      }
    });
    
  } catch (error) {
    console.error("Token validation error:", error);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: "Unauthorized", 
        message: "انتهت صلاحية رمز المصادقة" 
      });
    }
    
    res.status(401).json({ 
      error: "Unauthorized", 
      message: "رمز المصادقة غير صالح" 
    });
  }
};

module.exports = {
  loginUser,
  validateToken
};