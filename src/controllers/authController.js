const admin = require("firebase-admin");
const { z } = require("zod");

// Zod schema for registration input validation
const registerSchema = z.object({
  email: z.string().email({ message: "البريد الإلكتروني غير صالح" }),
  password: z.string().min(6, { message: "يجب أن تتكون كلمة المرور من 6 أحرف على الأقل" }),
});

// Zod schema for email input validation
const emailSchema = z.object({
  email: z.string().email({ message: "البريد الإلكتروني غير صالح" }),
});

// Controller function for user registration
const registerUser = async (req, res) => {
  try {
    // 1. Validate input
    const validationResult = registerSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ 
        error: "Invalid input", 
        details: validationResult.error.errors.map(e => e.message) 
      });
    }

    const { email, password } = validationResult.data;

    // 2. Create user in Firebase Authentication
    const userRecord = await admin.auth().createUser({
      email: email,
      password: password,
      emailVerified: false, // User needs to verify email
    });

    // 3. Generate verification link (Firebase handles sending based on console settings)
    try {
      const verificationLink = await admin.auth().generateEmailVerificationLink(email);
      console.log(`Generated verification link for ${email}: ${verificationLink}`); // Log link for debugging/info
    } catch (linkError) {
        console.error(`Failed to generate verification link for ${email}:`, linkError);
    }

    console.log(`Successfully created new user: ${userRecord.uid}`);
    
    res.status(201).json({
      message: "تم تسجيل المستخدم بنجاح. تم إرسال بريد إلكتروني للتحقق (إذا تم تكوينه في Firebase).",
      user: {
        uid: userRecord.uid,
        email: userRecord.email,
        emailVerified: userRecord.emailVerified,
      },
    });

  } catch (error) {
    console.error("Error registering user:", error);
    if (error.code === 'auth/email-already-exists') {
      return res.status(409).json({ error: "Conflict", message: "البريد الإلكتروني مسجل مسبقاً." });
    }
    if (error.code === 'auth/invalid-password') {
       return res.status(400).json({ error: "Bad Request", message: error.message });
    }
    res.status(500).json({ error: "Internal Server Error", message: "حدث خطأ أثناء تسجيل المستخدم." });
  }
};

// Controller function to request sending email verification
const requestVerificationEmail = async (req, res) => {
  try {
    const validationResult = emailSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ 
        error: "Invalid input", 
        details: validationResult.error.errors.map(e => e.message) 
      });
    }
    const { email } = validationResult.data;

    // Get user record
    let userRecord;
    try {
        userRecord = await admin.auth().getUserByEmail(email);
    } catch (error) {
        if (error.code === 'auth/user-not-found') {
            return res.status(404).json({ error: "Not Found", message: "المستخدم غير موجود." });
        }
        throw error;
    }

    if (userRecord.emailVerified) {
        return res.status(400).json({ error: "Bad Request", message: "البريد الإلكتروني تم التحقق منه بالفعل." });
    }

    // Generate and send verification email
    const actionCodeSettings = {
      url: process.env.VERIFICATION_REDIRECT_URL || 'https://your-app.com/verify-email',
      handleCodeInApp: true
    };

    await admin.auth().generateEmailVerificationLink(email, actionCodeSettings)
      .then((link) => {
        // Here Firebase will automatically send the email if configured properly
        console.log('Verification email sent successfully');
        return res.status(200).json({ 
          message: "تم إرسال رابط التحقق إلى بريدك الإلكتروني."
        });
      })
      .catch((error) => {
        console.error('Error sending verification email:', error);
        throw error;
      });

  } catch (error) {
    console.error("Error requesting verification email:", error);
    res.status(500).json({ 
      error: "Internal Server Error", 
      message: "حدث خطأ أثناء إرسال بريد التحقق." 
    });
  }
};

// Controller function to request password reset email
const requestPasswordReset = async (req, res) => {
  try {
    // 1. Validate input
    const validationResult = emailSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ 
        error: "Invalid input", 
        details: validationResult.error.errors.map(e => e.message) 
      });
    }
    const { email } = validationResult.data;

    // 2. Check if user exists (optional but good practice)
    try {
        await admin.auth().getUserByEmail(email);
    } catch (error) {
        if (error.code === 'auth/user-not-found') {
            // Even if user not found, return a generic success message
            // to avoid disclosing whether an email is registered.
            console.log(`Password reset requested for non-existent email: ${email}`);
            return res.status(200).json({ message: "إذا كان البريد الإلكتروني مسجلاً، فسيتم إرسال رابط إعادة تعيين كلمة المرور إليه." });
        }
        throw error; // Re-throw other errors
    }

    // 3. Generate password reset link (Firebase handles sending based on console settings)
    const resetLink = await admin.auth().generatePasswordResetLink(email);
    console.log(`Generated password reset link for ${email}: ${resetLink}`); // Log link for debugging/info

    res.status(200).json({ message: "إذا كان البريد الإلكتروني مسجلاً، فسيتم إرسال رابط إعادة تعيين كلمة المرور إليه." });

  } catch (error) {
    console.error("Error requesting password reset:", error);
    res.status(500).json({ error: "Internal Server Error", message: "حدث خطأ أثناء طلب إعادة تعيين كلمة المرور." });
  }
};

module.exports = {
  registerUser,
  requestVerificationEmail,
  requestPasswordReset, // Export the new function
};

