// const express = require("express");
// const { 
//   registerUser, 
//   requestVerificationEmail, 
//   requestPasswordReset 
// } = require("../controllers/authController");

// const router = express.Router();

// // Debug message to verify route file is being loaded
// console.log("Auth routes being loaded...");

// // POST /auth/register - User registration
// router.post("/register", registerUser);

// // POST /auth/request-verification-email - Request sending verification email
// router.post("/request-verification-email", requestVerificationEmail);

// // POST /auth/request-password-reset - Request sending password reset email
// router.post("/request-password-reset", requestPasswordReset);

// // Debug - Print registered routes in this router
// console.log("Auth routes registered:");
// router.stack.forEach((r) => {
//   if (r.route && r.route.path) {
//     Object.keys(r.route.methods).forEach((method) => {
//       console.log(`${method.toUpperCase()} /auth${r.route.path}`);
//     });
//   }
// });

// module.exports = router;
const express = require("express");
const { 
  registerUser, 
  requestVerificationEmail, 
  requestPasswordReset 
} = require("../controllers/authController");
const {
  loginUser,
  validateToken
} = require("../controllers/loginController");

const router = express.Router();

// Debug message to verify route file is being loaded
console.log("Auth routes being loaded...");

// POST /auth/register - User registration
router.post("/register", registerUser);

// POST /auth/login - User login (JWT token)
router.post("/login", loginUser);

// GET /auth/validate-token - Validate JWT token
router.get("/validate-token", validateToken);

// POST /auth/request-verification-email - Request sending verification email
router.post("/request-verification-email", requestVerificationEmail);

// POST /auth/request-password-reset - Request sending password reset email
router.post("/request-password-reset", requestPasswordReset);

// Debug - Print registered routes in this router
console.log("Auth routes registered:");
router.stack.forEach((r) => {
  if (r.route && r.route.path) {
    Object.keys(r.route.methods).forEach((method) => {
      console.log(`${method.toUpperCase()} /auth${r.route.path}`);
    });
  }
});

module.exports = router;